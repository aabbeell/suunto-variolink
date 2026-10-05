#!/usr/bin/env node
// ABOUTME: Checks round-watch simulator screenshots (PNG, 466/280/240 px) for content cut off by, or too close to, the round display edge.
// ABOUTME: No npm dependencies: decodes and encodes PNG with zlib; --annotate draws the safe circle and violations, --selftest runs a synthetic check.

'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');

const USAGE = [
  'usage: node safe-area.js [options] <screenshot.png> [more.png ...]',
  '       node safe-area.js --selftest',
  '',
  'Finds content (pixels that differ from the background colour) inside the round display,',
  'groups it into elements (words / text lines), widens each element around its own centre',
  'by --inflate to model wider glyphs on the real watch, and reports every element whose',
  'inflated box leaves the display circle shrunk by --margin, is clipped by the round edge,',
  'or touches the image border. Exit 0 = all clear, 1 = violations, 2 = usage or decode error.',
  '',
  'options:',
  '  --margin <px|N%>     safe distance from the round edge (default 6% of the radius)',
  '  --inflate <f>        horizontal widening factor around each element centre (default 1.15)',
  '  --inflate-y <f>      vertical widening factor (default 1.0)',
  '  --threshold <0-255>  min channel difference from the background to count as content (default 48)',
  '  --min-area <px>      ignore connected blobs smaller than this (default 3)',
  '  --annotate <out>     write an annotated copy; with several inputs, <out> is a directory',
  '  --all                list every element, not only the closest ones and the violations',
  '  --json               print machine-readable results instead of tables',
  '  --selftest           build synthetic images and verify the checker flags what it should',
].join('\n');

// ---------- PNG decode ----------

function decodePng(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.length < 8 || buf.toString('hex', 0, 8) !== sig) throw new Error('not a PNG file');
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('only 8-bit PNGs are supported (this one is ' + depth + '-bit)');
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
  const chans = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!chans) throw new Error('PNG colour type ' + ctype + ' not supported (palette images: re-save as RGB/RGBA)');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chans;
  if (raw.length < h * (stride + 1)) throw new Error('truncated PNG image data');
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const s = y * (stride + 1) + 1;
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= chans ? px[o + x - chans] : 0;
      const b = y ? px[o - stride + x] : 0;
      const c = (x >= chans && y) ? px[o - stride + x - chans] : 0;
      let v = raw[s + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (f !== 0) throw new Error('bad PNG filter type ' + f + ' on row ' + y);
      px[o + x] = v & 255;
    }
  }
  // Normalise to RGBA.
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += chans) {
    let r, g, b2, al = 255;
    if (chans === 1) { r = g = b2 = px[j]; }
    else if (chans === 2) { r = g = b2 = px[j]; al = px[j + 1]; }
    else if (chans === 3) { r = px[j]; g = px[j + 1]; b2 = px[j + 2]; }
    else { r = px[j]; g = px[j + 1]; b2 = px[j + 2]; al = px[j + 3]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b2; rgba[i * 4 + 3] = al;
  }
  return { w, h, rgba };
}

// ---------- PNG encode (RGBA, filter 0) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- analysis ----------

function analyse(img, opt) {
  const { w, h, rgba } = img;
  const D = Math.min(w, h);
  const R = D / 2;
  const cx = w / 2, cy = h / 2; // pixel centres sit at x + 0.5
  const margin = opt.marginPct != null ? R * opt.marginPct / 100 : (opt.marginPx != null ? opt.marginPx : R * 0.06);
  const safeR = R - margin;
  const warnings = [];
  if (w !== h) warnings.push('image is not square (' + w + 'x' + h + '); using a ' + D + ' px circle at the centre');
  if ([466, 280, 240].indexOf(D) < 0) warnings.push('display size ' + D + ' px is not a known SuuntoPlus size (466/280/240)');

  // Composite over black, keep only pixels inside the display circle.
  const N = w * h;
  const r8 = new Uint8Array(N), g8 = new Uint8Array(N), b8 = new Uint8Array(N);
  const inside = new Uint8Array(N);
  const hist = new Map();
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const a = rgba[i * 4 + 3];
      r8[i] = (rgba[i * 4] * a + 127) / 255; g8[i] = (rgba[i * 4 + 1] * a + 127) / 255; b8[i] = (rgba[i * 4 + 2] * a + 127) / 255;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      // Skip the outermost pixel ring: the simulator's own round mask does not match an
      // ideal circle exactly, and opaque (RGB) screenshots would read that rim as content.
      const d2 = dx * dx + dy * dy;
      if (d2 <= R * R && d2 > (R - 1) * (R - 1)) inside[i] = 2; // rim: only counts when attached to content
      else if (d2 <= (R - 1) * (R - 1)) {
        inside[i] = 1;
        const key = ((r8[i] >> 3) << 10) | ((g8[i] >> 3) << 5) | (b8[i] >> 3);
        hist.set(key, (hist.get(key) || 0) + 1);
      }
    }
  }
  let bgKey = 0, bgCount = -1;
  for (const [k, c] of hist) if (c > bgCount) { bgCount = c; bgKey = k; }
  // Mean of the exact colours in the modal bucket gives the background colour.
  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let i = 0; i < N; i++) {
    if (inside[i] !== 1) continue;
    const key = ((r8[i] >> 3) << 10) | ((g8[i] >> 3) << 5) | (b8[i] >> 3);
    if (key === bgKey) { sr += r8[i]; sg += g8[i]; sb += b8[i]; sn++; }
  }
  const bg = [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)];

  const mask = new Uint8Array(N), rim = [];
  for (let i = 0; i < N; i++) {
    if (!inside[i]) continue;
    const d = Math.max(Math.abs(r8[i] - bg[0]), Math.abs(g8[i] - bg[1]), Math.abs(b8[i] - bg[2]));
    if (d <= opt.threshold) continue;
    if (inside[i] === 1) mask[i] = 1; else rim.push(i);
  }

  // Connected components (8-connectivity).
  const label = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const comps = [];
  for (let start = 0; start < N; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = comps.length;
    const c = { x0: w, y0: h, x1: -1, y1: -1, area: 0 };
    let sp = 0;
    stack[sp++] = start; label[start] = id;
    while (sp) {
      const i = stack[--sp];
      const x = i % w, y = (i - x) / w;
      c.area++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let ny = y - 1; ny <= y + 1; ny++) {
        if (ny < 0 || ny >= h) continue;
        for (let nx = x - 1; nx <= x + 1; nx++) {
          if (nx < 0 || nx >= w) continue;
          const j = ny * w + nx;
          if (mask[j] && label[j] < 0) { label[j] = id; stack[sp++] = j; }
        }
      }
    }
    comps.push(c);
  }

  // Merge glyph blobs into words / text lines.
  let groups = comps.map((c, i) => ({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, area: c.area, comps: [i] }));
  const vTolBase = Math.max(2, D * 0.008);
  const minLineH = D * 0.04;
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const A = groups[a], B = groups[b];
        const ha = A.y1 - A.y0 + 1, hb = B.y1 - B.y0 + 1;
        const vgap = Math.max(0, Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1) - 1);
        const hgap = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1) - 1);
        const vOverlap = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) + 1;
        const hOverlap = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) + 1;
        const narrower = Math.min(A.x1 - A.x0, B.x1 - B.x0) + 1;
        // Word spacing scales with line height; the floor keeps short glyphs such as "--" together.
        const sameLine = vOverlap > 0 && hgap <= 0.6 * Math.max(ha, hb, minLineH);
        // i-dots, accents, colon halves: mostly above/below each other with a tiny gap.
        const stacked = hOverlap >= 0.5 * narrower && vgap <= Math.max(vTolBase, 0.2 * Math.min(ha, hb));
        if (sameLine || stacked) {
          A.x0 = Math.min(A.x0, B.x0); A.y0 = Math.min(A.y0, B.y0);
          A.x1 = Math.max(A.x1, B.x1); A.y1 = Math.max(A.y1, B.y1);
          A.area += B.area; A.comps = A.comps.concat(B.comps);
          groups.splice(b, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  groups = groups.filter((g) => g.area >= opt.minArea);

  // Rim content next to a component means that component is cut by the round edge;
  // on the image border it also touches the edge of the screenshot.
  const clippedIds = new Set(), borderIds = new Set();
  const onBorder = (i) => { const x = i % w, y = (i - x) / w; return x === 0 || y === 0 || x === w - 1 || y === h - 1; };
  for (const i of rim) {
    const x = i % w, y = (i - x) / w;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(h - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(w - 1, x + 1); nx++) {
        const id = label[ny * w + nx];
        if (id < 0) continue;
        clippedIds.add(id);
        if (onBorder(i)) borderIds.add(id);
      }
    }
  }

  // Per-element checks.
  const elements = groups.map((g) => {
    const ex = (g.x0 + g.x1 + 1) / 2, ey = (g.y0 + g.y1 + 1) / 2;
    const hw = (g.x1 - g.x0 + 1) / 2 * opt.inflate, hh = (g.y1 - g.y0 + 1) / 2 * opt.inflateY;
    const box = { x0: ex - hw, x1: ex + hw, y0: ey - hh, y1: ey + hh };
    let far = 0;
    for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > far) far = d;
    }
    const clearance = safeR - far;
    // Pixel-level: clipped by the round mask, touching the image border, and the
    // inflated ink itself (less strict than the box, whose corners are often empty).
    let rawFar = 0, inkFar = 0, imageEdge = false;
    const ids = new Set(g.comps);
    for (let y = g.y0; y <= g.y1; y++) {
      for (let x = g.x0; x <= g.x1; x++) {
        const i = y * w + x;
        if (!mask[i] || !ids.has(label[i])) continue;
        // Farthest corner of this pixel from the centre.
        const fx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx)), fy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy));
        const d = Math.hypot(fx, fy);
        if (d > rawFar) rawFar = d;
        const ix = Math.max(Math.abs(ex + (x - ex) * opt.inflate - cx), Math.abs(ex + (x + 1 - ex) * opt.inflate - cx));
        const iy = Math.max(Math.abs(ey + (y - ey) * opt.inflateY - cy), Math.abs(ey + (y + 1 - ey) * opt.inflateY - cy));
        const di = Math.hypot(ix, iy);
        if (di > inkFar) inkFar = di;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) imageEdge = true; // non-square images
      }
    }
    for (const id of g.comps) if (borderIds.has(id)) imageEdge = true;
    const clipped = rawFar >= R - 1 || g.comps.some((id) => clippedIds.has(id));
    const issues = [];
    if (imageEdge) issues.push('IMAGE EDGE');
    if (clipped) issues.push('CLIPPED');
    if (clearance < 0) issues.push('OUTSIDE SAFE');
    return {
      x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1,
      width: g.x1 - g.x0 + 1, height: g.y1 - g.y0 + 1, area: g.area,
      inflated: { x0: +box.x0.toFixed(1), x1: +box.x1.toFixed(1), y0: +box.y0.toFixed(1), y1: +box.y1.toFixed(1) },
      clearance: +clearance.toFixed(1),
      inkClearance: +(safeR - inkFar).toFixed(1),
      edgeClearance: +(R - rawFar).toFixed(1),
      issues,
    };
  });
  elements.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  return {
    width: w, height: h, diameter: D, radius: R, margin: +margin.toFixed(1), safeRadius: +safeR.toFixed(1),
    inflate: opt.inflate, inflateY: opt.inflateY, threshold: opt.threshold, background: bg,
    warnings, elements, violations: elements.filter((e) => e.issues.length).length,
  };
}

// ---------- annotation ----------

function annotate(img, res) {
  const { w, h } = img;
  const out = Buffer.from(img.rgba);
  // Darken the transparent exterior so the drawing is visible in any viewer.
  for (let i = 0; i < w * h; i++) {
    const a = out[i * 4 + 3];
    if (a < 255) {
      for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round((out[i * 4 + k] * a + 40 * (255 - a)) / 255);
      out[i * 4 + 3] = 255;
    }
  }
  const put = (x, y, col) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; out[i + 3] = 255;
  };
  const cx = w / 2, cy = h / 2;
  const steps = Math.ceil(2 * Math.PI * res.safeRadius * 2);
  for (let s = 0; s < steps; s++) {
    const t = s / steps * 2 * Math.PI;
    put(cx - 0.5 + res.safeRadius * Math.cos(t), cy - 0.5 + res.safeRadius * Math.sin(t), [0, 200, 255]);
  }
  const rect = (x0, y0, x1, y1, col) => {
    for (let x = Math.round(x0); x <= Math.round(x1); x++) { put(x, y0, col); put(x, y1, col); }
    for (let y = Math.round(y0); y <= Math.round(y1); y++) { put(x0, y, col); put(x1, y, col); }
  };
  for (const e of res.elements) {
    const bad = e.issues.length > 0;
    const col = bad ? [255, 40, 40] : (e.clearance < res.margin ? [255, 190, 0] : [0, 220, 90]);
    rect(e.inflated.x0 - 0.5, e.inflated.y0 - 0.5, e.inflated.x1 - 0.5, e.inflated.y1 - 0.5, col);
    if (bad) rect(e.inflated.x0 - 1.5, e.inflated.y0 - 1.5, e.inflated.x1 + 0.5, e.inflated.y1 + 0.5, col);
  }
  return encodePng(w, h, out);
}

// ---------- reporting ----------

function pad(s, n, right) { s = String(s); return right ? s.padStart(n) : s.padEnd(n); }

function printReport(file, res, showAll) {
  console.log(file);
  console.log('  display ' + res.diameter + ' px, radius ' + res.radius + ', margin ' + res.margin + ' px -> safe radius ' +
    res.safeRadius + '; inflate x' + res.inflate + (res.inflateY !== 1 ? ' / y' + res.inflateY : '') +
    '; background rgb(' + res.background.join(',') + '), threshold ' + res.threshold);
  for (const wmsg of res.warnings) console.log('  warning: ' + wmsg);
  const ranked = res.elements.slice().sort((a, b) => a.clearance - b.clearance);
  const shown = showAll ? res.elements : res.elements.filter((e) => e.issues.length || ranked.indexOf(e) < 5);
  console.log('  ' + pad('#', 3, true) + '  ' + pad('box x0-x1, y0-y1', 22) + pad('size', 9) + pad('inflated x0-x1', 16) +
    pad('box', 7, true) + pad('ink', 7, true) + '  status');
  for (const e of shown) {
    const n = res.elements.indexOf(e) + 1;
    console.log('  ' + pad(n, 3, true) + '  ' + pad(e.x0 + '-' + e.x1 + ', ' + e.y0 + '-' + e.y1, 22) +
      pad(e.width + 'x' + e.height, 9) + pad(Math.round(e.inflated.x0) + '-' + Math.round(e.inflated.x1), 16) +
      pad(e.clearance.toFixed(1), 7, true) + pad(e.inkClearance.toFixed(1), 7, true) + '  ' +
      (e.issues.length ? e.issues.join(', ') : 'ok'));
  }
  if (!showAll && shown.length < res.elements.length) console.log('  (' + (res.elements.length - shown.length) + ' more elements with more clearance; --all lists them)');
  console.log('  ' + res.elements.length + ' elements, ' + (res.violations ? res.violations + ' VIOLATION' + (res.violations > 1 ? 'S' : '') : 'all inside the safe area'));
  console.log('  box = px from the inflated box to the safe circle (negative = violation); ink = the same for the inflated pixels themselves (informational)');
}

// ---------- self-test ----------

const FONT = { // 5x7 bitmap glyphs, one row per number, MSB = leftmost of 5 columns
  A: [14, 17, 17, 31, 17, 17, 17], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15],
  K: [17, 18, 20, 24, 20, 18, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 6: [6, 8, 16, 30, 17, 17, 14], '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
};

function synthImage(D, texts) {
  const rgba = Buffer.alloc(D * D * 4);
  const R = D / 2;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x + 0.5 - R, dy = y + 0.5 - R;
    if (dx * dx + dy * dy <= R * R) rgba[(y * D + x) * 4 + 3] = 255; // opaque black disc, transparent outside
  }
  for (const t of texts) {
    const s = t.scale, adv = 6 * s;
    const width = t.str.length * adv - s;
    let x = t.cx != null ? Math.round(t.cx - width / 2) : t.x;
    for (const ch of t.str) {
      const rows = FONT[ch];
      if (rows) for (let ry = 0; ry < 7; ry++) for (let rx = 0; rx < 5; rx++) {
        if (!(rows[ry] & (16 >> rx))) continue;
        for (let py = 0; py < s; py++) for (let px = 0; px < s; px++) {
          const X = x + rx * s + px, Y = t.y + ry * s + py;
          if (X < 0 || Y < 0 || X >= D || Y >= D) continue;
          const dx = X + 0.5 - R, dy = Y + 0.5 - R;
          if (dx * dx + dy * dy > R * R) continue; // the round display clips
          const i = (Y * D + X) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = t.grey || 255;
        }
      }
      x += adv;
    }
  }
  return encodePng(D, D, rgba);
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-area-'));
  const opt = { threshold: 48, minArea: 3, inflate: 1.15, inflateY: 1, marginPx: null, marginPct: null };
  let failures = 0;
  const check = (name, cond) => { console.log('  ' + (cond ? 'pass' : 'FAIL') + '  ' + name); if (!cond) failures++; };
  const find = (res, x, y) => res.elements.find((e) => x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1);

  // 466 px: margin 13.98 px, safe radius 219.0.
  const q = path.join(dir, 'synthetic-q.png');
  fs.writeFileSync(q, synthImage(466, [
    { str: 'SAFE', cx: 233, y: 200, scale: 6 },          // centred: passes
    { str: 'OK', cx: 233, y: 120, scale: 4, grey: 140 }, // dim grey text still counts
    { str: 'EDGE', x: 32, y: 292, scale: 3 },            // inside the circle as drawn, outside only after inflation
    { str: 'CUT', x: 380, y: 170, scale: 5 },            // runs off the round edge
    { str: 'TOP', cx: 233, y: 0, scale: 3 },             // touches the top image border
    { str: '-14.6', cx: 233, y: 380, scale: 4 },         // bottom line, well inside
  ]));
  const resQ = analyse(decodePng(fs.readFileSync(q)), opt);
  const resQflat = analyse(decodePng(fs.readFileSync(q)), Object.assign({}, opt, { inflate: 1 }));
  console.log('synthetic 466 px (' + q + ')');
  const safe = find(resQ, 233, 210), ok = find(resQ, 233, 125), edge = find(resQ, 40, 300), edgeFlat = find(resQflat, 40, 300);
  const cut = find(resQ, 400, 180), top = find(resQ, 233, 2), num = find(resQ, 233, 385);
  check('"SAFE" is one element and passes', safe && safe.width > 100 && safe.issues.length === 0);
  check('dim grey "OK" is detected and passes', ok && ok.issues.length === 0);
  check('"EDGE" passes without inflation', edgeFlat && edgeFlat.issues.length === 0);
  check('"EDGE" fails with x1.15 inflation', edge && edge.issues.indexOf('OUTSIDE SAFE') >= 0);
  check('"CUT" is flagged as clipped by the round edge', cut && cut.issues.indexOf('CLIPPED') >= 0);
  check('"TOP" is flagged as touching the image border', top && top.issues.indexOf('IMAGE EDGE') >= 0);
  check('"-14.6" is one element and passes', num && num.width > 100 && num.issues.length === 0);
  check('six elements found', resQ.elements.length === 6);

  // 240 px: two labels side by side stay separate elements.
  const n = path.join(dir, 'synthetic-n.png');
  fs.writeFileSync(n, synthImage(240, [
    { str: 'DOT', x: 40, y: 110, scale: 2 },
    { str: 'DOT', x: 140, y: 110, scale: 2 },
  ]));
  const resN = analyse(decodePng(fs.readFileSync(n)), opt);
  console.log('synthetic 240 px (' + n + ')');
  check('two separate labels stay two elements', resN.elements.length === 2);
  check('margin defaults to 6% of the radius (7.2 px)', resN.margin === 7.2);

  // Encoder round trip.
  const ann = path.join(dir, 'synthetic-q-annotated.png');
  fs.writeFileSync(ann, annotate(decodePng(fs.readFileSync(q)), resQ));
  const back = decodePng(fs.readFileSync(ann));
  check('annotated PNG decodes back at the same size', back.w === 466 && back.h === 466);
  console.log(failures ? failures + ' self-test check(s) FAILED' : 'self-test passed; images in ' + dir);
  return failures ? 1 : 0;
}

// ---------- CLI ----------

function main(argv) {
  const opt = { threshold: 48, minArea: 3, inflate: 1.15, inflateY: 1, marginPx: null, marginPct: null };
  const files = [];
  let annotateOut = null, json = false, all = false;
  const num = (v, name) => { const n = parseFloat(v); if (!isFinite(n)) throw new Error(name + ' needs a number'); return n; };
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--selftest') return selftest();
      if (a === '-h' || a === '--help') { console.log(USAGE); return 0; }
      if (a === '--margin') {
        const v = argv[++i] || '';
        if (/%$/.test(v)) opt.marginPct = num(v.slice(0, -1), '--margin'); else opt.marginPx = num(v, '--margin');
      } else if (a === '--inflate') opt.inflate = num(argv[++i], '--inflate');
      else if (a === '--inflate-y') opt.inflateY = num(argv[++i], '--inflate-y');
      else if (a === '--threshold') opt.threshold = num(argv[++i], '--threshold');
      else if (a === '--min-area') opt.minArea = num(argv[++i], '--min-area');
      else if (a === '--annotate') { annotateOut = argv[++i]; if (!annotateOut) throw new Error('--annotate needs an output path'); }
      else if (a === '--json') json = true;
      else if (a === '--all') all = true;
      else if (a.startsWith('--')) throw new Error('unknown option ' + a);
      else files.push(a);
    }
  } catch (e) { console.error('error: ' + e.message + '\n\n' + USAGE); return 2; }
  if (!files.length) { console.error(USAGE); return 2; }

  let anyViolation = false, anyError = false;
  const results = [];
  if (annotateOut && files.length > 1) fs.mkdirSync(annotateOut, { recursive: true });
  for (const f of files) {
    let img, res;
    try { img = decodePng(fs.readFileSync(f)); res = analyse(img, opt); }
    catch (e) { console.error(f + ': ' + e.message); anyError = true; continue; }
    if (res.violations) anyViolation = true;
    if (annotateOut) {
      const out = files.length > 1 ? path.join(annotateOut, path.basename(f, '.png') + '-safe.png') : annotateOut;
      fs.writeFileSync(out, annotate(img, res));
      res.annotated = out;
    }
    results.push(Object.assign({ file: f }, res));
    if (!json) { printReport(f, res, all); if (res.annotated) console.log('  annotated: ' + res.annotated); console.log(''); }
  }
  if (json) console.log(JSON.stringify(results, null, 1));
  return anyError ? 2 : (anyViolation ? 1 : 0);
}

process.exitCode = main(process.argv.slice(2));
