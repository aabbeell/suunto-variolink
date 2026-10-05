#!/usr/bin/env node
// ABOUTME: Measures an app dir with SUUNTOPO sp-mem (lowmem est32, shipped form) in the standard ble_vario states.
// ABOUTME: Usage: node measure.js <appDir> [label ...] [--fast] [--tsv out.tsv]; prints one row per state (SPEC §0.1 B7).

// States (the same labels as the 2026-10-04 memory profile, so rows compare column for column). Since the XC review
// round the shipped default is the classic page (pg 2): every state below except the last two sets the automatic
// pages (pg 0, the largest configuration), as before; capture-classic is the store default.
//   capture-u8     the recorded UltraBip stream (scen-vario.js) with Uint8Array payloads, one drop and reconnect
//   capture-array  the same with Array payloads (the harness queues a whole tick's arrays: an inflated run peak)
//   idle-retry     no vario in range, three 112 connect failures (scen-idle.js)
//   flight-sparse  synthetic thermal/glide/sink loop, 1 LK8EX1 + 1 GPRMC per second, GPS line on (scen-flight.js)
//   long2h         the full-rate synthetic flight for 7,200 ticks with Uint8Array payloads, a drop every 300 ticks
//   xc-flight      the full-rate synthetic flight with watch GPS fixes (circling in wind, then glide; scen-xc.js),
//                  automatic pages: the XC engine (ext6-9.js) runs circling detection, the wind fit and the store
//   xc-classic     the same with the classic page setting (pg 2): the XC engine is never loaded
//   capture-classic  capture-u8 with the data.json default (the classic page)
//   mtu23-auto / mtu23-classic  the full-rate synthetic flight in 20-byte notifications (scen-flight.js mode=mtu23):
//                  the shape the Race S delivers (SPEC hardware results 2026-10-04), automatic and classic pages
// Columns (est32 bytes): steady, load peak (scaled), run peak (scaled; a lower bound, the harness GCs every tick),
// exercise-end peak, largest live block, largest compiled function, module scope record (derived from the shipped
// main.js's module names with the measured step table, harness.scopeRecord: sp-mem lists only the 8 largest blocks,
// so a record under ~1.5 KB never appears there; "TOP8" would mean it grew into them), all scope records together
// (measured), cyclic garbage (ticks with any, and the largest), allocations per tick, live growth per tick over the
// second half, app errors.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOL = ['../../../../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/sp-mem/sp-mem.js', '../../../../SUUNTOPO/tools/sp-mem/sp-mem.js'].map((p) => path.join(__dirname, p)).find((p) => fs.existsSync(p)) || '';
const HERE = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'blevario-measure-'));

// Synthetic recordings: flight = 10 LK8EX1 + 10 LXWP0 + 1 GPRMC per second; sparse = 1 LK8EX1 + 1 GPRMC per second.
function recordings() {
  const ck = (s) => { let c = 0; for (let i = 0; i < s.length; i++) c ^= s.charCodeAt(i); return ('0' + c.toString(16).toUpperCase()).slice(-2); };
  const line = (b) => '$' + b + '*' + ck(b) + '\r\n';
  const rate = (s) => { s %= 128; if (s < 60) return 2.5 + 0.5 * Math.sin(s * 0.7); if (s < 100 || s >= 110) return -1.2; return -3.1; };
  let alt = 1500, full = '', sparse = '';
  for (let t = 0; t < 128; t++) {
    for (let i = 0; i < 10; i++) {
      const v = rate(t + i / 10);
      alt += v / 10;
      const p = Math.round(101325 * Math.pow(1 - alt / 44330.77, 5.255876));
      const l = line('LK8EX1,' + p + ',' + Math.round(alt) + ',' + Math.round(v * 100) + ',12,1087,');
      full += l;
      if (i === 0) sparse += l;
      full += line('LXWP0,N,,' + alt.toFixed(1) + ',' + v.toFixed(2) + ',,,,,,,,');
    }
    const crs = t % 128 < 60 ? (t * 24) % 360 : 245;
    const r = line('GPRMC,120000.00,A,4600.000,N,00800.000,E,' + (18.9 + 4 * Math.sin(crs * 0.0174533)).toFixed(1) + ',' + crs.toFixed(1) + ',031026,,,A,V');
    full += r;
    sparse += r;
  }
  fs.writeFileSync(path.join(TMP, 'flight.txt'), full);
  fs.writeFileSync(path.join(TMP, 'sparse.txt'), sparse);
}

const STATES = {
  'capture-u8': ['scen-vario.js', ['type=uint8array', 'pg=0']],
  'capture-array': ['scen-vario.js', ['pg=0']],
  'idle-retry': ['scen-idle.js', ['retry=1', 'pg=0']],
  'flight-sparse': ['scen-flight.js', ['recfile=' + path.join(TMP, 'sparse.txt'), 'pg=0']],
  long2h: ['scen-flight.js', ['recfile=' + path.join(TMP, 'flight.txt'), 'type=uint8array', 'ticks=7200', 'pg=0']],
  'xc-flight': ['scen-xc.js', ['recfile=' + path.join(TMP, 'flight.txt'), 'type=uint8array', 'pg=0']],
  'xc-classic': ['scen-xc.js', ['recfile=' + path.join(TMP, 'flight.txt'), 'type=uint8array', 'pg=2']],
  'capture-classic': ['scen-vario.js', ['type=uint8array']],
  'mtu23-auto': ['scen-flight.js', ['recfile=' + path.join(TMP, 'flight.txt'), 'type=uint8array', 'mode=mtu23', 'pg=0']],
  'mtu23-classic': ['scen-flight.js', ['recfile=' + path.join(TMP, 'flight.txt'), 'type=uint8array', 'mode=mtu23', 'pg=2']]
};
const H = require('../harness');

function run(appDir, label) {
  const [scen, sets] = STATES[label];
  const json = path.join(TMP, label + '.json');
  const args = [TOOL, appDir, '--scenario', path.join(HERE, scen), '--variants', 'lowmem', '--forms', 'shipped', '--json', json];
  for (const s of sets) { if (s.startsWith('ticks=')) args.push('--ticks', s.slice(6)); else args.push('--set', s); }
  const txt = execFileSync('node', args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  const J = JSON.parse(fs.readFileSync(json, 'utf8')), r = J.results['lowmem/shipped'], SC = r.categories.indexOf('scopes');
  const cp = (l) => r.checkpoints.find((c) => c.label === l);
  const base = cp('baseline'), st = cp('steady state'), ui = cp('UI mounted'), end = cp('exercise end');
  const app = (c) => c.live - base.live, a32 = (c) => c.walk.t32Total - base.walk.t32Total;
  const ratio = (c) => a32(c) / app(c);
  const loadHost = Math.max(...['main.js loaded', 'onLoad', 'onExerciseStart', 'UI mounted'].map((l) => cp(l).phasePeak)) - base.live;
  const ticks = r.ticks.filter((t) => t[0] > 0);
  const runHost = Math.max(...ticks.map((t) => t[3])) - base.live;
  const garbage = ticks.filter((t) => t[7] > 0);
  const half = ticks[Math.floor(ticks.length / 2)], last = ticks[ticks.length - 1];
  const top8 = st.walk.appTopBlocks.some((b) => b[2] === 'scopes');
  const scopesAll = st.walk.t32[SC] - base.walk.t32[SC];
  const size = (/shipped main\.js ([\d,]+) B/.exec(txt) || [])[1] || '?';
  return {
    label,
    steady: a32(st),
    watchFit: st.walkAlt.t32Total - base.walkAlt.t32Total,
    loadPeak: Math.round(loadHost * ratio(ui)),
    loadBracket: Math.round(a32(ui) + (loadHost - app(ui)) * 0.5) + '-' + Math.round(a32(ui) + (loadHost - app(ui))),
    runPeak: Math.round(runHost * ratio(st)),
    endPeak: Math.round((end.phasePeak - base.live) * ratio(st)),
    maxBlock: st.walk.maxAppBlockT32 + ' ' + st.walk.maxAppBlockCat,
    maxFn: st.walk.maxAppFnBlockT32,
    scope: top8 ? 'TOP8' : NAMES + ' names ' + H.scopeRecord(NAMES),
    scopesAll,
    garbage: garbage.length + ' ticks, max ' + Math.max(0, ...garbage.map((t) => t[7])) + ' B host' + (garbage.length ? ' at t=' + garbage.slice(0, 6).map((t) => t[0]).join(',') : ''),
    allocsPerTick: Math.round(ticks.reduce((s, t) => s + t[4], 0) / ticks.length),
    growth: ((last[2] - half[2]) / (last[0] - half[0])).toFixed(2),
    errors: r.errorsTotal,
    blocks: st.blocks - base.blocks,
    fns: st.walk.appTopBlocks.map((b) => b[0] + ' ' + b[2]).join(', '),
    mainJs: size
  };
}

const argv = process.argv.slice(2);
const appDir = path.resolve(argv[0] || path.join(__dirname, '../../../src/ble_vario'));
const tsv = argv.indexOf('--tsv') >= 0 ? argv[argv.indexOf('--tsv') + 1] : null;
let labels = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i] !== tsv);
if (!labels.length) labels = argv.includes('--fast') ? ['capture-u8', 'idle-retry', 'flight-sparse', 'xc-flight'] : Object.keys(STATES);
recordings();
const cols = ['label', 'steady', 'watchFit', 'loadPeak', 'loadBracket', 'runPeak', 'endPeak', 'maxBlock', 'maxFn', 'scope', 'scopesAll', 'garbage', 'allocsPerTick', 'growth', 'errors', 'blocks', 'mainJs'];
let NAMES;
(async () => {
NAMES = H.moduleNames(await H.minifiedMain(appDir));
console.log(cols.join('\t'));
for (const l of labels) {
  const row = run(appDir, l);
  const line = cols.map((c) => row[c]).join('\t');
  console.log(line);
  if (l === labels[0]) console.log('  top blocks: ' + row.fns);
  if (tsv) fs.appendFileSync(tsv, appDir + '\t' + line + '\n');
}
fs.rmSync(TMP, { recursive: true, force: true });
})();
