#!/usr/bin/env node
// ABOUTME: Unit tests for ble_vario: parser (incl. the recorded UltraBip capture), BLE flow and fallbacks, altitude,
// ABOUTME: averages, flight/thermal, GPS, UI push, demo gate, settings, summary, editor-minified code. Exit 1 on failure.

'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { makeEnv, connected, lkTick, sentence, bytes, pressureAt, qne, lk8, xor, hex2 } = H;

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });
const fail = (msg) => { throw new Error(msg); };
const ok = (c, msg) => { if (!c) fail(msg || 'assertion failed'); };
const eq = (a, b, msg) => {
  const same = a === b || (typeof a === 'number' && typeof b === 'number' && a !== a && b !== b);
  if (!same) fail((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
};
const near = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) fail((msg ? msg + ': ' : '') + 'expected ' + b + ' +-' + tol + ', got ' + a); };
const sameSet = (a, b, msg) => eq(JSON.stringify([...a].sort()), JSON.stringify([...b].sort()), msg);
const arr = (a) => JSON.stringify(Array.from(a));

// Test vectors (spec §16a). Checksums are recomputed in P1, not trusted.
const V = {
  lk1: '$LK8EX1,98705,220,0,20,1090,*2A',
  lk2: '$LK8EX1,98706,220,-1,20,1090,*05',
  gga: '$GPGGA,171143.00,4513.6048,N,00548.5377,E,1,04,4.1,269.3,M,48.5,M,,*6D',
  rmc: '$GPRMC,171143.00,A,4513.6048,N,00548.5377,E,0.0,330.3,300323,,,A,V*21',
  lk3: '$LK8EX1,84512,1504,185,12,1072,*12',
  lx: '$LXWP0,N,,1504.2,1.85,,,,,,245,,*50',
  sent: '$LK8EX1,999999,99999,9999,99,999,*13',
  volt: '$LK8EX1,84512,1504,-312,12,3.95,*26',
  pflau: '$PFLAU,0,0,0,1,0,,0,,*63',
  cap1: '$LK8EX1,100425,75,0,23,1050,*26', // recorded from the user's UltraBip, 2026-10-03
  cap2: '$LXWP0,N,,75.2,0.00,,,,,,,,*6D'
};
const L = (s) => s + '\r\n';
// bN counts the LK8EX1 lines accepted into the open tick bin (the store build has no running total: nOk is debug-only).
const BINS = ['bP', 'bN', 'bV', 'bVN', 'nBad', 'gFix', 'gsp'];
const snap = (env) => BINS.map((k) => k + '=' + env.state(k)).join(' ');
const parserEnv = () => connected();

// ======================= Recorded capture (binding decision 2: the primary fixture) =======================
const CAP = H.capture();
const CAP_LINES = fs.readFileSync(path.join(__dirname, '../../docs/research/ultrabip-capture/lines-2026-10-03.txt'), 'utf8').split('\n').filter((l) => l.startsWith('$'));
const capRef = () => { // independent reference decode of the recorded lines (string based, test-only)
  let p = 0, n = 0, v = 0;
  for (const l of CAP_LINES) if (l.startsWith('$LK8EX1')) { const f = l.split(','); p += +f[1]; v += +f[3]; n++; }
  return { p, n, v };
};
test('C1 recorded capture: all 794 notifications -> 397 LK8EX1 accepted, 397 LXWP0 ignored, nothing bad, battery 50 %', () => {
  eq(CAP.length, 794, 'notifications');
  eq(CAP_LINES.length, 794, 'decoded lines');
  const r = capRef();
  eq(r.n, 397);
  const env = parserEnv();
  for (const c of CAP) env.ble(1, 106, c.bytes);
  eq(env.state('bN'), 397, 'LK8EX1 accepted');
  eq(env.state('nBad'), 0, 'LXWP0 is not counted as bad');
  eq(env.state('bP'), r.p, 'pressure sum');
  eq(env.state('bV'), r.v, 'vario sum');
  const d = connected({ app: H.variant('dbg') });
  for (const c of CAP) d.ble(1, 106, c.bytes);
  eq(d.state('nOk'), 397, 'debug variant: LK8EX1 accepted');
  eq(d.state('nMax'), 34, 'debug variant: largest notification');
});

test('C2 recorded capture re-chunked at every size 1..19 bytes (MTU-23 watches) and per-notification 20-byte splits', () => {
  const ref = parserEnv();
  for (const c of CAP) ref.ble(1, 106, c.bytes);
  const want = snap(ref);
  const all = [].concat(...CAP.map((c) => c.bytes));
  for (let k = 1; k <= 19; k++) {
    const env = parserEnv();
    for (let i = 0; i < all.length; i += k) env.ble(1, 106, all.slice(i, i + k));
    eq(snap(env), want, 'chunk size ' + k);
  }
  const env = parserEnv();
  for (const c of CAP) for (let i = 0; i < c.bytes.length; i += 20) env.ble(1, 106, Uint8Array.from(c.bytes.slice(i, i + 20)));
  eq(snap(env), want, 'each notification split at 20 bytes');
});

test('C3 recorded capture replayed in real time: LIVE in 2 ticks, QNE 75 m, vario ~0, battery 50, src vario', () => {
  const env = connected({ settings: { ar: '2' } });
  env.start();
  let i = 0;
  const live = [];
  for (let s = 1; s <= 40; s++) {
    while (i < CAP.length && CAP[i].t < s) env.ble(1, 106, CAP[i++].bytes);
    env.tick();
    live.push(env.state('ls'));
  }
  eq(live[0], 1, 'first tick: one good tick, still linking');
  eq(live[1], 2, 'LIVE from the second tick');
  ok(live.slice(1).every((x) => x === 2), 'LIVE throughout (median gap 31 ms, max 149 ms)');
  near(env.output.alt, qne(100424), 0.2, 'QNE altitude from the recorded pressure');
  near(env.output.alt, 75.2, 0.6, 'matches the LXWP0 altitude the vario itself reports');
  ok(Math.abs(env.output.vs) <= 0.05, 'vario on a desk: ' + env.output.vs);
  ok(!env.scr.visible('s0') && !env.scr.visible('s2'), 'no static VARIO line while the vario is live (owner request 2026-10-04)');
  eq(env.output.src, 2);
  eq(env.state('air'), 0, 'no take-off from a desk');
  eq(env.scr.lost.length, 0, 'no lost setText');
});

// ======================= Parser =======================
test('P1 checksums of all vectors match the recomputed XOR; flipped bit rejected; lower-case hex accepted', () => {
  for (const k of Object.keys(V)) eq(hex2(xor(V[k].slice(1, V[k].indexOf('*')))), V[k].slice(-2), 'vector ' + k);
  let env = parserEnv();
  env.feed(L(V.lk1) + L(V.lk2) + L(V.lk3) + L(V.lx));
  eq(env.state('bN'), 3, 'three LK8EX1 accepted');
  eq(env.state('nBad'), 0, 'LXWP0 ignored silently');
  env = parserEnv();
  env.feed(L(V.lk1.replace('98705', '98704')));
  eq(env.state('bN'), 0, 'flipped bit rejected');
  eq(env.state('nBad'), 1, 'and counted');
  env = parserEnv();
  env.feed(L('$LK8EX1,98705,220,0,20,1090,*2a'));
  eq(env.state('bN'), 1, 'lower-case hex accepted');
});

test('P2 LK8EX1 fields: 98705 Pa, 0 / -1 cm/s, battery 1090 -> 90 %, 1072 -> 72 %', () => {
  const env = parserEnv();
  env.feed(L(V.lk1));
  eq(env.state('bP'), 98705);
  eq(env.state('bN'), 1);
  eq(env.state('bV'), 0);
  eq(env.state('bVN'), 1);
  env.feed(L(V.lk2));
  eq(env.state('bP'), 98705 + 98706);
  eq(env.state('bV'), -1);
  env.feed(L(V.lk3));
  eq(env.state('bN'), 3, 'battery 1072 parses like any line');
});

const STREAM = L(V.lk1) + L(V.gga) + L(V.lk2) + L(V.lx) + L(V.rmc) + L(V.lk3);
test('P3 fragmentation: every split point and chunk sizes 1..40 give identical samples (LK8EX1, GGA, LXWP0, RMC)', () => {
  const ref = parserEnv();
  ref.feed(STREAM);
  const want = snap(ref);
  eq(ref.state('bN'), 3);
  eq(ref.state('nBad'), 0, 'GGA and LXWP0 are known and ignored');
  eq(ref.state('gFix'), true, 'RMC parsed');
  const b = bytes(STREAM);
  for (let i = 1; i < b.length; i++) {
    const env = parserEnv();
    env.ble(1, 106, b.slice(0, i));
    env.ble(1, 106, b.slice(i));
    eq(snap(env), want, 'split at ' + i);
  }
  for (let k = 1; k <= 40; k++) {
    const env = parserEnv();
    for (let i = 0; i < b.length; i += k) env.ble(1, 106, b.slice(i, i + k));
    eq(snap(env), want, 'chunk size ' + k);
  }
});

test('P4 resynchronisation: garbage, missing $, truncated line, $ mid-line, 200-byte junk, CR/LF without checksum', () => {
  const cases = [
    ['leading garbage', 'xx#@!,,*7\r\n' + L(V.lk1), 1, 0],
    ['missing $', L(V.lk1.slice(1)) + L(V.lk2), 1, 0],
    ['truncated line then full line', '$LK8EX1,98705,22' + L(V.lk2), 1, 0],
    ['$ in mid-line', '$LK8EX1,987$LK8EX1,98706,220,-1,20,1090,*05\r\n', 1, 0],
    ['200-byte junk run', '$' + 'A'.repeat(200) + L(V.lk1), 1, 1],
    ['CR/LF without checksum', '$LK8EX1,98705,220,0,20,1090,\r\n' + L(V.lk1), 1, 1],
    ['bad hex digit', '$LK8EX1,98705,220,0,20,1090,*2G\r\n' + L(V.lk1), 1, 1],
    ['":" is not a hex digit', '$LK8EX1,98705,220,0,20,1090,*2:\r\n' + L(V.lk1), 1, 1],
    ['overlong sentence id', L('$LK8EX1X,98705,220,0,20,1090,*00') + L(V.lk1), 1, 1]
  ];
  for (const [name, s, okN, badN] of cases) {
    const env = parserEnv();
    env.feed(s);
    eq(env.state('bN'), okN, name + ' ok');
    eq(env.state('nBad'), badN, name + ' bad');
  }
});

test('P5 sentinels and invalid values never reach the bins', () => {
  let env = parserEnv();
  env.feed(L(V.sent));
  eq(env.state('nBad'), 1, 'all-sentinel line counted as bad');
  eq(env.state('bN') + env.state('bVN'), 0);
  env = parserEnv();
  env.feed(sentence('LK8EX1,98705,220,9999,99,1080,'));
  eq(env.state('bN'), 1, 'pressure used');
  eq(env.state('bVN'), 0, 'vario sentinel 9999 ignored');
  env.feed(L(V.volt));
  eq(env.state('bV'), -312);
  env.feed(sentence('LK8EX1,84512,1504,10,12,999,'));
  eq(env.state('nBad'), 0, 'battery 999 is not a bad line');
});

test('P6 empty trailing field, leading +, -0, decimal pressure, malformed numbers', () => {
  const env = parserEnv();
  env.feed(sentence('LK8EX1,98705.5,220,+185,20,1090,') + sentence('LK8EX1,98705,220,-0,20,1090,'));
  eq(env.state('bN'), 2);
  eq(env.state('bP'), 98705.5 + 98705);
  eq(env.state('bV'), 185);
  eq(env.state('bVN'), 2);
  env.feed(sentence('LK8EX1,98705,220,1-2,20,1090,') + sentence('LK8EX1,98705,220,1.2.3,20,1090,'));
  eq(env.state('bVN'), 2, 'malformed varios are not samples');
  eq(env.state('bN'), 4, 'the valid pressure still counts');
});

test('P7 LXWP0 is never used, even when LK8EX1 is missing (deep-dive rule: parse only LK8EX1)', () => {
  const env = parserEnv();
  for (let i = 0; i < 3; i++) { lkTick(env, 1504, 1504, 100, 5); env.feed(L(V.lx)); env.tick(); }
  eq(env.state('ls'), 2);
  near(env.output.vs, 1.0, 1e-9, 'LK8EX1 vario');
  for (let i = 0; i < 5; i++) { env.feed(L(V.lx).repeat(10)); env.tick(); }
  eq(env.state('ls'), 3, 'only LXWP0: NO DATA');
  eq(env.state('nBad'), 0);
});

test('P8 GGA, GNGGA and $PFLAU skipped; RMC/GNRMC give fix, speed and course; status V is no fix', () => {
  const env = parserEnv();
  env.feed(L(V.lk1));
  const before = snap(env);
  const gn = 'GNGGA,171143.00,4513.6048,N,00548.5377,E,1,04,4.1,269.3,M,48.5,M,,';
  env.feed(L(V.gga) + sentence(gn));
  eq(snap(env), before, 'GGA/GNGGA change nothing');
  env.feed(L(V.pflau));
  eq(env.state('nBad'), 1, '$PFLAU counted as an unknown line');
  env.feed(sentence('GNRMC,120000.00,A,4600.000,N,00800.000,E,18.9,245.0,031026,,,A,V'));
  eq(env.state('gFix'), true);
  near(env.state('gsp'), 18.9 * 0.514444, 1e-6, 'knots to m/s');
  near(env.state('ghd'), 245 * Math.PI / 180, 1e-4, 'degrees to radians');
  env.feed(sentence('GPRMC,120001.00,V,,,,,,,031026,,,N,V'));
  eq(env.state('gFix'), false, 'status V');
  env.feed(L(V.lk2));
  eq(env.state('bN'), 2, 'parsing continues');
});

test('P9 static scan of main.js (store, debug, demo): allocation-free data path (onBle handler + fin), <= 8 module functions, <= 56 module names, no literals, regex, Date, let/const, =>', () => {
  const esprima = require(path.join(H.LIB, '../../../esprima'));
  const src = fs.readFileSync(path.join(H.APP, 'main.js'), 'utf8');
  for (const [label, text] of [['store', src], ['debug variant', fs.readFileSync(path.join(H.variant('dbg'), 'main.js'), 'utf8')], ['demo variant', fs.readFileSync(path.join(H.variant('demo'), 'main.js'), 'utf8')]]) {
    // the notification branch of the handler that onBle's closure creates, and fin() inside that closure
    const a = text.indexOf('\n', text.indexOf('\n  onBle = function (ch, ev, d) {') + 1);
    const b = text.indexOf('\n      return;\n    }', a);
    ok(a > 0 && b > a, label + ': data path found');
    const c = text.indexOf('\n', text.indexOf('\n  var fin = function (b) {') + 1);
    const d = text.indexOf('\n  };', c);
    ok(c > 0 && d > c, label + ': fin() found');
    const body = (text.slice(a, b) + text.slice(c, d)).replace(/\/\/[^\n]*/g, '');
    for (const bad of ['String.fromCharCode', '.split(', '.substr(', '.slice(', 'new ', '[]', 'function (', '{}', 'concat', "'", '"', 'systemEvent']) ok(body.indexOf(bad) < 0, label + ': data path contains ' + bad);
    // module-level helpers: function expressions and closures (an immediately called function expression)
    let fns = 0, names = 0;
    for (const st of esprima.parseScript(text).body) {
      ok(st.type === 'VariableDeclaration' || st.type === 'FunctionDeclaration', label + ': top-level ' + st.type);
      if (st.type !== 'VariableDeclaration') continue;
      names += st.declarations.length;
      for (const d of st.declarations) if (d.init && (d.init.type === 'FunctionExpression' || (d.init.type === 'CallExpression' && d.init.callee.type === 'FunctionExpression'))) fns++;
    }
    ok(fns <= 8, label + ': ' + fns + ' module-level functions');
    ok(names <= 56, label + ': ' + names + ' module-level names (a 57th grows the scope record by a 1 KB hash part)');
  }
  const prog = esprima.parseScript(src, { range: true });
  const walk = (n, f) => { if (n && typeof n.type === 'string') { f(n); for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, f)); else if (v && typeof v.type === 'string') walk(v, f); } } };
  let arrays = 0, objects = 0;
  walk(prog, (n) => { if (n.type === 'ArrayExpression') arrays++; if (n.type === 'ObjectExpression') objects++; });
  eq(arrays, 0, 'array literals');
  eq(objects, 1, 'object literals (only getUserInterface\'s return value)');
  for (const f of ['main.js', 'ext1.js', 'ext2.js', 'ext3.js', 'ext4.js', 'ext5.js']) {
    const s = fs.readFileSync(path.join(H.APP, f), 'utf8');
    const toks = esprima.tokenize(f === 'main.js' ? s : '(' + s + '\n)');
    for (const t of toks) {
      ok(t.type !== 'RegularExpression', f + ': regex literal');
      ok(t.type !== 'Template', f + ': template literal');
      ok(!(t.type === 'Keyword' && /^(let|const|class)$/.test(t.value)), f + ': ' + t.value);
      ok(!(t.type === 'Punctuator' && t.value === '=>'), f + ': arrow function');
      ok(!(t.type === 'Identifier' && t.value === 'Date'), f + ': Date');
    }
    ok(s.indexOf('{{') < 0, f + ': "{{" would be rewritten by Handlebars');
    const lines = s.split('\n');
    ok(/^\/\/ ABOUTME: /.test(lines[0]) && /^\/\/ ABOUTME: /.test(lines[1]), f + ': ABOUTME header');
    if (f !== 'main.js') ok(!/localStorage/.test(s) || f === 'ext5.js', f + ': only ext5.js reads localStorage');
  }
  ok(/^<!-- ABOUTME: /.test(H.HTML.split('\n')[0]) && /^<!-- ABOUTME: /.test(H.HTML.split('\n')[1]), 'v.html ABOUTME header');
  ok(!/localStorage/.test(src), 'main.js never touches localStorage');
});

test('P10 valid pressure with no usable vario field: pressure-derived rate, never a frozen number; -32 m/s accepted (adversarial F3)', () => {
  const env = connected();
  let h = 1000;
  for (let t = 0; t < 10; t++) { lkTick(env, h, h + 2.5, 250); h += 2.5; env.tick(); }
  near(env.output.vs, 2.5, 1e-6, 'climbing');
  const noVario = (rate, field) => { let s = ''; for (let i = 0; i < 10; i++) { h += rate / 10; s += sentence('LK8EX1,' + Math.round(pressureAt(h)) + ',' + Math.round(h) + ',' + field + ',20,1080,'); } env.feed(s); env.tick(); };
  for (let t = 0; t < 20; t++) noVario(-3.5, '9999');
  eq(env.state('ls'), 2, 'still LIVE (the pressure is valid)');
  near(env.output.vs, -3.5, 0.1, 'sinking 3.5 m/s from the pressure (was +2.5 frozen, green)');
  eq(env.scr.text('nm'), '-3.5');
  near(env.output.av, -3.5, 0.1, 'average agrees');
  for (let t = 0; t < 3; t++) noVario(-1.2, '');
  near(env.output.vs, -1.2, 0.1, 'empty vario field');
  env.tick();
  noVario(-1.2, '9999');
  eq(env.output.vs, undefined, 'after an empty tick there is no previous bin: "--", not an old value');
  eq(env.scr.text('nm'), '--');
  for (let t = 0; t < 5; t++) { let s = ''; for (let i = 0; i < 10; i++) { h -= 3.2; s += lk8(Math.round(pressureAt(h)), Math.round(h), -3200); } env.feed(s); env.tick(); }
  near(env.output.vs, -32, 1e-6, 'a -32 m/s spiral is a valid vario value (was rejected and frozen)');
  eq(env.scr.text('nm'), '-30.0', 'display clamps at 30.0');
  env.feed(sentence('LK8EX1,98705,220,9999,20,1080,') + sentence('LK8EX1,98705,220,-9000,20,1080,'));
  eq(env.state('bVN'), 0, '9999 and -9000 are not samples');
});

test('P11 LXWP0 and ..GGA are dropped at the sentence id (no per-byte parsing, no checksum work)', () => {
  const env = parserEnv();
  env.feed('$LXWP0,');
  eq(env.state('pst'), 0, 'LXWP0: parser back to waiting for $');
  env.feed('$GPGGA,');
  eq(env.state('pst'), 0, 'GPGGA');
  env.feed('$LK8EX1,');
  eq(env.state('pst'), 2, 'LK8EX1 fields are parsed');
  env.feed('$PFLAU,');
  eq(env.state('pst'), 2, 'unknown ids are still checked, so they count as bad');
  env.feed('0,0,0,1,0,,0,,*63\r\n');
  eq(env.state('nBad'), 1);
  const b = parserEnv();
  b.feed(L(V.lx.replace('*50', '*51')).repeat(5) + L(V.lk1));
  eq(b.state('nBad'), 0, 'a broken LXWP0 is not counted as bad data (it is never used)');
  eq(b.state('bN'), 1);
});

// ======================= Altitude, averages, flight, thermal =======================
test('A1 altitude: QNE 220.41 m, QNH 259.65 m with slp 101800, watch offset tracks on the ground and freezes in flight', () => {
  let env = connected({ settings: { ar: '2' } });
  for (let i = 0; i < 3; i++) { env.feed(L(V.lk1).repeat(10)); env.tick(); }
  near(env.output.alt, 220.41, 0.05, 'QNE');
  near(qne(98705), 220.41, 0.01);
  env = connected({ settings: { ar: '1' } });
  env.input.slp = 101800;
  for (let i = 0; i < 3; i++) { env.feed(L(V.lk1).repeat(10)); env.tick(); }
  near(env.output.alt, 259.65, 0.05, 'QNH');
  ok(env.scr.text('ll') === 'QNH', 'label QNH');
  env.input.slp = 50000;
  env.feed(L(V.lk1).repeat(10)); env.tick();
  near(env.output.alt, 220.41, 0.05, 'invalid sea-level pressure falls back to 101325 Pa');
  env = connected();
  env.start();
  env.input.walt = 500;
  for (let i = 0; i < 3; i++) { env.feed(L(V.lk1).repeat(10)); env.tick(); }
  near(env.output.alt, 500, 0.05, 'first tick matches the watch');
  eq(env.scr.text('ll'), 'ALT');
  env.input.walt = 530;
  env.feed(L(V.lk1).repeat(10)); env.tick();
  near(env.output.alt, 501, 0.05, 'EMA time constant 30 ticks');
  for (let i = 0; i < 200; i++) { env.feed(L(V.lk1).repeat(10)); env.tick(); }
  near(env.output.alt, 530, 0.1, 'converges to the watch on the ground');
  for (let i = 0; i < 9; i++) { env.feed(L(V.lk1).repeat(10)); env.tick({ spd: 8 }); }
  eq(env.state('air'), 1, 'airborne');
  env.input.walt = 900;
  for (let i = 0; i < 5; i++) { env.feed(L(V.lk1).repeat(10)); env.tick({ spd: 8 }); }
  near(env.output.alt, 530, 0.1, 'offset frozen in flight');
  const h = qne(98705) + 100;
  for (let i = 0; i < 3; i++) { lkTick(env, h, h, 0); env.tick({ spd: 8 }); }
  near(env.output.alt, 630, 0.3, 'vario altitude change still shown');
});

test('A1b no watch altitude or an implausible offset: QNH until the watch reports a plausible altitude', () => {
  let env = connected();
  env.input.walt = undefined;
  for (let i = 0; i < 3; i++) { env.feed(L(V.lk1).repeat(10)); env.tick(); }
  eq(env.state('am'), 1);
  eq(env.scr.text('ll'), 'QNH');
  env.input.walt = 400;
  env.feed(L(V.lk1).repeat(10)); env.tick();
  eq(env.state('am'), 0, 'match-watch once the watch altitude exists');
  eq(env.scr.text('ll'), 'ALT');
  env = connected();
  env.input.walt = 3000;
  for (let i = 0; i < 3; i++) { env.feed(L(V.lk1).repeat(10)); env.tick(); }
  eq(env.state('am'), 1, 'offset > 1500 m');
});

// The A, B5, B7, U2, U6 and U8 tests check the classic page (setting pg 2), whose outputs av, gn and ft always carry
// AVG, GAIN and flight time; the automatic pages are tested in the X tests (gn and ft show other values there).
const classic = (o) => Object.assign({}, o, { settings: Object.assign({ pg: '2' }, o && o.settings) });
const climbSession = (o) => { const env = connected(classic(o)); env.start(); return env; };
test('A2 average climb: 2.00 m/s exactly; robust to a delayed burst and to a lost tick; 30 s window', () => {
  const env = climbSession();
  let h = 1000;
  for (let i = 0; i < 15; i++) { lkTick(env, h, h + 2, 200); h += 2; env.tick(); }
  near(env.output.av, 2.0, 0.02, 'steady 10 Hz');
  env.tick();
  near(env.output.av, 2.0, 0.02, 'empty tick: newest valid bin, real distance');
  lkTick(env, h, h + 4, 200, 20); h += 4; env.tick();
  near(env.output.av, 2.0, 0.11, 'burst tick (bins carry no timestamps: biased ~0.1 for one tick)');
  for (let i = 0; i < 3; i++) { lkTick(env, h, h + 2, 200); h += 2; env.tick(); }
  near(env.output.av, 2.0, 0.02, 'back to exact');
  env.tick(); h += 2;
  for (let i = 0; i < 3; i++) { lkTick(env, h, h + 2, 200); h += 2; env.tick(); }
  near(env.output.av, 2.0, 0.02, 'after a lost tick');
  const e30 = climbSession({ settings: { aw: '3' } });
  h = 1000;
  for (let i = 0; i < 14; i++) { lkTick(e30, h, h + 1, 100); h += 1; e30.tick(); }
  eq(e30.output.av, undefined, 'needs half the window (15 s)');
  for (let i = 0; i < 20; i++) { lkTick(e30, h, h + 1, 100); h += 1; e30.tick(); }
  near(e30.output.av, 1.0, 0.02, '30 s window');
  eq(e30.scr.text('la'), 'AVG 30s', 'window shown in the label');
});

test('A3 flight detection: car burst, hiking, take-off by speed and by climb, ridge soaring, landing window, pause', () => {
  let env = climbSession();
  let h = 1000;
  const run = (n, rate, spd) => { for (let i = 0; i < n; i++) { lkTick(env, h, h + rate, rate * 100); h += rate; env.tick({ spd }); } };
  run(4, 0, 20);
  run(20, 0, 1);
  eq(env.state('air'), 0, 'car burst (4 s; take-off needs 5 s above 12.6 km/h since 2026-10-04)');
  run(120, 0.3, 1.4);
  eq(env.state('air'), 0, 'hiking climb');
  eq(env.output.ft, 0);
  run(8, -1.5, 9);
  eq(env.state('air'), 1, 'take-off by speed after 8 ticks');
  eq(env.output.ft, 8, 'detection window counted as flight time');
  run(100, -1.0, 9);
  eq(env.output.ft, 108);
  for (let i = 0; i < 200; i++) { const r = 1.2 * Math.sin(i / 5); lkTick(env, h, h + r, r * 100); h += r; env.tick({ spd: 0.5 }); }
  eq(env.state('air'), 1, 'ridge soaring at low ground speed is not a landing');
  let n = 0, ftBefore = 0;
  while (env.state('air') === 1 && n < 200) { ftBefore = env.output.ft; run(1, 0, 0.5); n++; }
  eq(env.state('air'), 0, 'landed');
  ok(n >= 60 && n <= 75, 'landing detected 60 still ticks after the last movement: ' + n);
  eq(env.output.ft, ftBefore + 1 - 60, 'the 60-tick landing window is not flight time');
  env = climbSession();
  h = 1000;
  for (let i = 0; i < 25; i++) { lkTick(env, h, h + 1.5, 150); h += 1.5; env.tick({ spd: undefined }); }
  eq(env.state('air'), 1, 'take-off by climb with no speed input');
  for (let i = 0; i < 89; i++) { lkTick(env, h, h, 0); env.tick({ spd: undefined }); }
  eq(env.state('air'), 1, '89 ticks');
  for (let i = 0; i < 12; i++) { lkTick(env, h, h, 0); env.tick({ spd: undefined }); }
  eq(env.state('air'), 0, 'landed after 90 still ticks without speed');
  env = connected();
  for (let i = 0; i < 20; i++) { lkTick(env, h, h, 0); env.tick({ spd: 10 }); }
  eq(env.state('air'), 0, 'exercise not started');
  env.start();
  env.pause();
  for (let i = 0; i < 20; i++) { lkTick(env, h, h, 0); env.tick({ spd: 10 }); }
  eq(env.state('air'), 0, 'paused');
  env.cont();
  for (let i = 0; i < 8; i++) { lkTick(env, h, h, 0); env.tick({ spd: 10 }); }
  eq(env.state('air'), 1, 'continued');
});

// The watch altitude follows the vario 300 m higher (frozen offset in flight), as it would on a real flight.
test('A4 thermal: 300 m climb -> gain 300 +-1.5; exit after 15 ticks of negative average; best kept; source switch', () => {
  const env = climbSession();
  let h = 2000;
  const run = (n, rate) => { for (let i = 0; i < n; i++) { lkTick(env, h, h + rate, rate * 100); h += rate; env.tick({ spd: 9, walt: h + 300 }); } };
  run(40, -1);
  eq(env.state('air'), 1);
  eq(env.output.gn, undefined, 'no gain before the first thermal');
  run(150, 2);
  eq(env.state('th'), 1, 'in thermal');
  near(env.output.gn, 300, 1.5, 'gain at the top (1-s bins lag the tick end by ~0.5 s: -1.35 m)');
  run(20, -1);
  eq(env.state('th'), 1, 'not out yet (average turns negative ~7 ticks after the top)');
  run(2, -1);
  eq(env.state('th'), 0, 'out after 15 ticks of negative average');
  near(env.output.gn, 300, 1.5, 'last gain shown');
  run(75, 2);
  run(25, -1);
  near(env.output.gn, 150, 1.5, 'second thermal');
  near(env.state('bestG'), 300, 1.5, 'best gain kept');
  run(80, 2);
  const g0 = env.output.gn;
  for (let i = 0; i < 10; i++) { h += 2; env.tick({ spd: 9, walt: h + 300 }); }
  eq(env.output.src, 1, 'watch fallback');
  near(env.output.gn - g0, 20, 0.1, 'a 10-s vario dropout: the watch barometer bridges it exactly (was 16 of 20 m)');
  for (let i = 0; i < 5; i++) { lkTick(env, h, h + 2, 200); h += 2; env.tick({ spd: 9, walt: h + 300 }); }
  eq(env.output.src, 2, 'vario back');
  near(env.output.gn - g0, 30, 0.1, 'and the vario continues from there');
  const g1 = env.output.gn;
  env.tick({ spd: 9, walt: 5000 }); // the watch altitude jumps (recalibration) during a 1-tick vario gap
  lkTick(env, h, h + 4, 200, 20); h += 4; env.tick({ spd: 9, walt: 5000 });
  near(env.output.gn - g1, 4, 1.1, 'a watch altitude jump is not climb; the gap is bridged by the vario');
});

test('A4b thermal gain with late bursts and short dropouts is exact (adversarial F4: was 255 of 360 m)', () => {
  for (const N of [10, 5, 3]) { // one empty tick in every N, its lines delivered with the next tick
    const env = climbSession();
    let h = 1500;
    for (let i = 0; i < 40; i++) { lkTick(env, h, h - 1, -100); h -= 1; env.tick({ spd: 9, walt: h + 300 }); }
    let carry = null;
    for (let t = 1; t <= 180; t++) {
      const a = h, b = h + 2;
      h = b;
      if (t % N === 0) { carry = [a, b]; env.tick({ spd: 9, walt: h + 300 }); continue; }
      if (carry) { lkTick(env, carry[0], carry[1], 200, 10); carry = null; }
      lkTick(env, a, b, 200, 10);
      env.tick({ spd: 9, walt: h + 300 });
    }
    near(env.output.gn, 358.7, 2.5, 'empty tick every ' + N + ' s (no-gap result 358.7)');
  }
  for (const G of [1, 2, 3, 4, 6, 12]) { // gaps of G ticks with no line at all, 4 times in a thermal
    const env = climbSession();
    let h = 1500;
    for (let i = 0; i < 40; i++) { lkTick(env, h, h - 1, -100); h -= 1; env.tick({ spd: 9, walt: h + 300 }); }
    for (let t = 0; t < 30; t++) { lkTick(env, h, h + 2, 200); h += 2; env.tick({ spd: 9, walt: h + 300 }); }
    const g0 = env.output.gn, h0 = h;
    for (let r = 0; r < 4; r++) {
      for (let t = 0; t < G; t++) { h += 2; env.tick({ spd: 9, walt: h + 300 }); }
      for (let t = 0; t < 6; t++) { lkTick(env, h, h + 2, 200); h += 2; env.tick({ spd: 9, walt: h + 300 }); }
    }
    eq(env.state('th'), 1);
    near(env.output.gn - g0, h - h0, 0.1, G + '-tick gaps');
  }
});

test('A5 formatting and colour tiers for every sink setting', () => {
  const env = connected();
  const f = env.state('fmt'); // private to ui()'s closure
  env.setState('um', 0);
  for (const [v, s] of [[2.3, '+2.3'], [-0.44, '-0.4'], [0.04, '0.0'], [-0.04, '0.0'], [0, '0.0'], [0.05, '+0.1'], [-0.05, '-0.1'], [35, '+30.0'], [-31, '-30.0'], [NaN, '--'], [12.34, '+12.3']]) eq(f(v), s, 'metric ' + v);
  eq(f(-0.04, 1), 0, 'key of 0.0');
  eq(f(2.34, 1), 23, 'key in tenths');
  env.setState('um', 1);
  for (const [v, s] of [[2.4, '+470'], [-2.5, '-490'], [0.01, '0'], [40, '+5900'], [-40, '-5900'], [NaN, '--']]) eq(f(v), s, 'imperial ' + v);
  for (let sk = 0; sk <= 5; sk++) {
    const e = connected({ settings: { sk: String(sk) } });
    const thr = sk ? -(1.0 + 0.5 * sk) : null;
    const colour = (v) => { for (let i = 0; i < 3; i++) { lkTick(e, 1000, 1000, v * 100); e.tick(); } return e.scr.el.nm.color; };
    eq(colour(0.15), '#c-green', 'sk ' + sk + ': +0.2 displayed is green');
    eq(colour(0.14), '#cm-bgc', 'sk ' + sk + ': +0.1 is neutral');
    if (thr === null) eq(colour(-9), '#cm-bgc', 'Off: never red');
    else { eq(colour(thr), '#c-red', 'sk ' + sk + ' at threshold'); eq(colour(thr + 0.06), '#cm-bgc', 'sk ' + sk + ' just above'); }
  }
});

// ======================= BLE =======================
const SVC16 = [0xFB, 0x34, 0x9B, 0x5F, 0x80, 0x00, 0x00, 0x80, 0x00, 0x10, 0x00, 0x00, 0xE0, 0xFF, 0x00, 0x00];
const CHR16 = SVC16.slice(0, 12).concat([0xE1, 0xFF, 0x00, 0x00]);
test('B1 BLE flow: connect by name, register both UUID forms after 100, notify, data, 101, reconnect registers again and re-enables', () => {
  const env = makeEnv();
  env.load();
  ok(env.logs.length === 0);
  env.tick();
  eq(env.callsNamed('connect').length, 1);
  eq(env.calls[0].args[0], 7, 'enabledZappId passed');
  ok(env.logs.some((l) => /connect/.test(l)), '"connect called" log line');
  for (let i = 0; i < 5; i++) env.tick();
  eq(env.calls.length, 1, 'no setup call before event 100');
  env.ble(0, 111);
  env.tick();
  eq(env.calls.length, 1, '111 changes nothing');
  env.ble(0, 100);
  eq(env.calls.length, 1, 'nothing from inside the handler');
  env.tick();
  const r1 = env.callsNamed('regUuid');
  eq(r1.length, 1);
  eq(r1[0].args[0], 3, 'connection id');
  eq(r1[0].args[1], 1, 'id 1');
  eq(arr(r1[0].args[2]), '[224,255]', 'FFE0 2-byte form first (Race S: the 16-byte form gets 110)');
  eq(arr(r1[0].args[3]), '[225,255]', 'FFE1 2-byte form first');
  env.tick();
  const r2 = env.callsNamed('regUuid');
  eq(r2.length, 2);
  eq(r2[1].args[1], 2, 'id 2');
  eq(arr(r2[1].args[2]), JSON.stringify(SVC16), 'FFE0 16-byte little-endian');
  eq(arr(r2[1].args[3]), JSON.stringify(CHR16), 'FFE1 16-byte little-endian');
  env.tick();
  eq(env.callsNamed('enaCharNotf').length, 0, 'waits for the 107s');
  env.ble(1, 107);
  env.ble(2, 107);
  env.tick();
  eq(JSON.stringify(env.callsNamed('enaCharNotf')[0].args), '[3,1]', 'notifications on id 1 first');
  eq(env.output.con, 0, 'con stays 0 until 109 or data');
  env.ble(1, 109);
  env.tick();
  eq(env.output.con, 1, 'con = 1 closes the Searching view');
  lkTick(env, 1000, 1000, 50); env.tick();
  lkTick(env, 1000, 1000, 50); env.tick();
  eq(env.state('ls'), 2, 'LIVE');
  env.ble(0, 101);
  env.tick();
  eq(env.output.con, 0, 'con = 0 after 101');
  eq(env.state('ls'), 4, 'LOST');
  eq(env.output.src, 1, 'watch fallback');
  const nCalls = env.calls.length;
  for (let i = 0; i < 30; i++) env.tick();
  eq(env.calls.length, nCalls, 'no calls while waiting for the system reconnect');
  env.ble(0, 100);
  env.tick();
  env.tick();
  eq(env.callsNamed('regUuid').length, 4, 'both forms registered again (Race S 2026-10-10: after 101/100 the old registration is gone, enaCharNotf only got 110)');
  env.ble(1, 107);
  env.ble(2, 107);
  env.tick();
  eq(env.callsNamed('enaCharNotf').length, 2, 'notifications re-enabled after the reconnect');
  eq(JSON.stringify(env.callsNamed('enaCharNotf')[1].args), '[3,1]', 'on the form that delivered data');
  lkTick(env, 1000, 1000, 50); env.tick();
  lkTick(env, 1000, 1000, 50); env.tick();
  eq(env.state('ls'), 2, 'LIVE again');
  eq(env.output.con, 1);
  for (const t of Object.keys(env.perTick)) ok(env.perTick[t] <= 1, 'one appConn call in tick ' + t);
  eq(env.handlerAppCalls, 0, 'no appConn call from inside the handler');
});

// A scripted watch + vario for the BLE setup. reg[form]: 'ok' (107), 'throw' (every call), 'throw1' (the first
// call only), '108', 'silent' (no event), or a function of the call count returning one of these. ena[form]: 'data' (109, then 10 lines per tick), 'nodata' (109 only), '110',
// 'throw' (every call), 'throw1' (the first call only, then data). Events are queued and delivered before the next
// tick, as the firmware does from its own task.
const rig = (reg, ena, o) => {
  const env = makeEnv(o);
  const ac = env.ctx.appConn;
  const q = [];
  const n = { reg: {}, ena: {} };
  let streaming = 0;
  const wrap = (name, f) => { const orig = ac[name]; ac[name] = (...a) => { orig(...a); return f(...a); }; };
  wrap('regUuid', (c, id) => {
    n.reg[id] = (n.reg[id] || 0) + 1;
    const m = typeof reg[id] === 'function' ? reg[id](n.reg[id]) : reg[id]; // a function picks the outcome per call
    if (m === 'throw' || (m === 'throw1' && n.reg[id] === 1)) throw new Error('Duktape BLE API err 5');
    if (m === '108') q.push([id, 108]);
    else if (m !== 'silent') q.push([id, 107]);
  });
  wrap('enaCharNotf', (c, id) => {
    n.ena[id] = (n.ena[id] || 0) + 1;
    const m = ena[id];
    if (m === 'throw' || (m === 'throw1' && n.ena[id] === 1)) throw new Error('Duktape BLE API err 9');
    if (m === '110') { q.push([id, 110]); return; }
    q.push([id, 109]);
    if (m === 'data' || m === 'throw1') streaming = id;
  });
  env.n = n;
  env.q = q;
  env.step = (k) => {
    for (let i = 0; i < (k || 1); i++) {
      while (q.length) env.ble(...q.shift());
      if (streaming) lkTick(env, 1000, 1000, 50);
      env.tick();
    }
  };
  env.drop = () => { streaming = 0; env.ble(0, 101); };
  env.enas = () => env.callsNamed('enaCharNotf').map((c) => c.args[1]);
  env.regs = () => env.callsNamed('regUuid').map((c) => c.args[1]);
  env.load(); env.ui(); env.tick(); env.ble(0, 111); env.ble(0, 100);
  return env;
};
const oneCallPerTick = (env) => { for (const t of Object.keys(env.perTick)) ok(env.perTick[t] <= 1, 'one appConn call in tick ' + t); };

test('B8 regUuid throws on the 16-byte form (platform P1): retried once, marked failed, setup continues on form 1', () => {
  const env = rig({ 1: 'ok', 2: 'throw' }, { 1: 'data' });
  env.step(30);
  eq(env.n.reg[2], 2, 'the 16-byte form is tried twice, then given up');
  eq(env.n.reg[1], 1);
  eq(env.enas()[0], 1, 'enaCharNotf(cid, 1) is called (was never called)');
  eq(env.state('ls'), 2, 'LIVE');
  ok(env.scr.text('rs') !== 'BLE ERROR' && env.state('nf') === 0, 'registration throws are not BLE errors');
  env.drop();
  env.step(3);
  env.ble(0, 100);
  env.step(6);
  eq(env.n.reg[1], 2, 'a reconnect registers form 1 again (the watch drops the registration on a 101)');
  eq(JSON.stringify(env.enas()), '[1,1]', 'it re-enables notifications on form 1');
  eq(env.state('ls'), 2, 'LIVE again');
  eq(env.handlerAppCalls, 0);
  oneCallPerTick(env);
});

test('B9 a registration that throws once is retried after 4 ticks and used', () => {
  const env = rig({ 1: 'throw1', 2: 'ok' }, { 1: 'data' });
  env.step(20);
  eq(env.n.reg[1], 2, 'form 1 retried');
  eq(env.enas()[0], 1, 'and enabled');
  eq(env.state('ls'), 2);
});

test('B10 a 108 on form 1: form 2 is enabled first and the 108 is not a BLE error', () => {
  const env = rig({ 1: '108', 2: 'ok' }, { 2: 'data' });
  env.step(4);
  eq(JSON.stringify(env.enas()), '[2]', 'no time lost on the failed form');
  env.step(3);
  eq(env.state('ls'), 2);
  eq(env.state('nf'), 0);
  const silent = rig({ 1: 'silent', 2: 'ok' }, { 2: 'data' });
  silent.step(12);
  eq(silent.enas()[0], 2, 'form 1 without a 107 while form 2 has one: form 2 after the 5-tick wait');
  eq(silent.state('ls'), 2);
});

test('B11 both forms register, only the 16-byte form delivers: form 2 after 10 silent ticks, kept after a reconnect', () => {
  const env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'nodata', 2: 'data' });
  env.step(3);
  eq(JSON.stringify(env.enas()), '[1]');
  env.step(9);
  eq(JSON.stringify(env.enas()), '[1]', 'still waiting after 9 silent ticks');
  env.step(1);
  eq(JSON.stringify(env.enas()), '[1,2]', 'the 16-byte form on the 10th');
  env.step(4);
  eq(env.state('ls'), 2, 'LIVE');
  env.step(30);
  eq(env.enas().length, 2, 'data locks the form: no more enable attempts');
  env.drop(); env.step(2); env.ble(0, 100); env.step(5);
  eq(JSON.stringify(env.enas()), '[1,2,2]', 'the reconnect re-enables the form that delivered');
  eq(env.state('ls'), 2);
  oneCallPerTick(env);
});

test('B12 enaCharNotf throws once (adversarial F2): retried on the same form after 4 ticks, not skipped', () => {
  const env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'throw1' });
  env.step(4);
  const first = env.callsNamed('enaCharNotf')[0].t;
  env.step(8);
  const c = env.callsNamed('enaCharNotf');
  eq(JSON.stringify(c.map((x) => x.args[1])), '[1,1]', 'same form again');
  eq(c[1].t - first, 4, 'after 4 ticks');
  eq(env.state('ls'), 2, 'LIVE about 6 s after the throw (was about 43 s, via form 2 and two poll phases)');
});

test('B13 no readChar polling (dropped, see SPEC §0.1 B2): with no data the two forms alternate every 10 ticks', () => {
  const env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'nodata', 2: 'nodata' });
  env.step(45);
  eq(JSON.stringify(env.enas()), '[1,2,1,2,1]');
  eq(env.callsNamed('readChar').length, 0);
  eq(env.state('ls'), 1, 'CONNECTING, not an error');
  oneCallPerTick(env);
});

test('B14 BLE ERROR is never sticky: valid data clears it at once; failures while data flows never set it', () => {
  // (a) enabling keeps throwing: ERROR after 9 failures, then the vario starts streaming anyway
  let env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'throw', 2: 'throw' });
  env.step(60);
  eq(env.state('ls'), 6, 'BLE ERROR after repeated failures with no data');
  eq(env.scr.text('rs'), 'BLE ERROR');
  lkTick(env, 1000, 1000, 50); env.tick();
  lkTick(env, 1000, 1000, 50); env.tick();
  eq(env.state('ls'), 2, 'LIVE as soon as data flows (was BLE ERROR for the rest of the connection)');
  eq(env.output.src, 2);
  ok(!env.scr.visible('s2') && !env.scr.visible('rs'), 'live: no WATCH BARO, no error text');
  // (b) failure events arriving while valid data flows (t-err-sticky / adversarial F1)
  env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'data' });
  env.step(6);
  let notLive = 0;
  for (let t = 0; t < 240; t++) {
    if (t % 4 === 0) env.ble(1, 110);
    if (t % 25 === 0) env.ble(0, 112);
    env.step();
    if (env.state('ls') !== 2) notLive++;
  }
  eq(notLive, 0, 'LIVE throughout');
  // (c) 110 on both forms (the 103/110 storm of adversarial F1b), then data on form 1
  env = rig({ 1: 'ok', 2: 'ok' }, { 1: '110', 2: '110' });
  env.step(40);
  for (let i = 0; i < 3; i++) { lkTick(env, 1000, 1000, 50); env.tick(); }
  eq(env.state('ls'), 2, 'LIVE once data arrives');
});

test('B15 a new connect (after 112) gets a new connection id: both UUID forms are registered again on its 100', () => {
  const env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'data' });
  env.step(8);
  eq(env.state('ls'), 2);
  eq(env.n.reg[1] + env.n.reg[2], 2);
  env.drop();
  env.ble(0, 112);
  env.step(12);
  eq(env.callsNamed('connect').length, 2, 'connect called again after 10 ticks');
  env.ble(0, 100);
  env.step(8);
  eq(env.n.reg[1] + env.n.reg[2], 4, 'registered again on the new connection (was skipped: rg survived)');
  eq(env.state('ls'), 2, 'LIVE');
});

test('B1c robustness: connect retries are bounded (platform R2-P2): throws 7x every 4 s then every 60 s, 112 6x after 10 s then every 60 s; ERROR hint; missing 107', () => {
  let env = makeEnv();
  env.load(); env.ui();
  const at = [];
  env.ctx.appConn.connect = () => { at.push(env.t); throw new Error('Duktape BLE API err 1'); };
  let err = 0;
  for (let i = 0; i < 3600; i++) { env.tick(); if (!err && env.state('ls') === 6) err = env.t; }
  eq(JSON.stringify(at.slice(0, 9)), '[1,5,9,13,17,21,25,86,147]', 'a failed call is retried after 4 ticks, then every 60 s');
  eq(err, 147, 'BLE ERROR after 9 failures');
  ok(at.length <= 70, at.length + ' connect calls in an hour (was 900, each compiling ext1.js and logging)');
  eq(JSON.stringify(env.extLoads), '["ext5.js","ext1.js"]', 'ext1.js is compiled once, in onLoad (was once per attempt: ~2.4 KB of cyclic garbage each)');
  eq(env.logs.filter((l) => /\[vl\] connect/.test(l)).length, 3, '"[vl] connect" logged for the first 3 attempts only');
  eq(env.scr.text('rs'), 'BLE ERROR', 'BLE ERROR shown');
  ok(env.scr.visible('h0') && env.scr.visible('h1'), 'hint lines in BLE ERROR on the ground (was never shown)');
  eq(env.scr.text('h0'), 'Restart exercise and vario', 'BLE ERROR hint');
  env = makeEnv();
  env.load(); env.ui(); env.tick();
  const gaps = [];
  for (let k = 0; k < 9; k++) {
    const n0 = env.callsNamed('connect').length;
    env.ble(0, 112);
    let w = 0;
    while (env.callsNamed('connect').length === n0 && w < 100) { env.tick(); w++; }
    gaps.push(w);
  }
  eq(JSON.stringify(gaps), '[11,11,11,11,11,11,61,61,61]', 'ticks from each 112 to the next connect');
  env.ble(0, 112);
  env.tick();
  eq(env.state('ls'), 6, 'ERROR after 9 connect failures');
  for (let i = 0; i < 31; i++) env.tick();
  eq(env.scr.text('h0'), 'Restart exercise and vario');
  env.ble(0, 100);
  env.tick();
  ok(env.state('ls') !== 6, 'error cleared by 100');
  env.ble(0, 101);
  for (let i = 0; i < 32; i++) env.tick();
  eq(env.state('ls'), 4, 'LINK LOST');
  eq(env.scr.text('h0'), 'Restart vario, check name', 'the usual hint again after the error cleared');
  env = makeEnv();
  env.load(); env.tick(); env.ble(0, 100); env.tick(); env.tick();
  env.ble(1, 107);
  for (let i = 0; i < 6; i++) env.tick();
  eq(env.callsNamed('enaCharNotf').length, 1, 'notifications enabled after a 5-tick wait for the missing 107');
});

test('B16 a link flap between the two UUID registrations (adversarial R1): form 2 is still registered, LIVE on form 2', () => {
  const env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'nodata', 2: 'data' });
  env.step(1); // regUuid(1); its 107 is queued
  env.ble(...env.q.shift()); // the 107 is local and arrives within the second
  env.ble(0, 101); env.ble(0, 100); // a short drop, and the system reconnects
  env.step(40);
  eq(JSON.stringify(env.regs()), '[1,1,2]', 'form 2 registered after the flap (it was never registered), form 1 again as after any reconnect');
  eq(env.state('ls'), 2, 'LIVE (was CONNECTING for the rest of the session)');
  eq(JSON.stringify(env.enas()), '[1,2]', 'form 1 first, the 16-byte form after 10 silent ticks');
  oneCallPerTick(env);
  eq(env.handlerAppCalls, 0);
});

test('B17 a flap before the first 107, duplicate registration refused with 108 (adversarial R1b): the 107 wins, LIVE on form 1', () => {
  const env = rig({ 1: (n) => (n === 1 ? 'ok' : '108'), 2: 'ok' }, { 1: 'data', 2: 'nodata' });
  env.step(1); // regUuid(1); its 107 is held back
  const late = env.q.shift();
  env.ble(0, 101); env.ble(0, 100); // the flap comes first
  env.step(1); // form 1 has no answer yet, so it is registered again: the firmware refuses the duplicate (108)
  env.ble(...late); // then the first registration's 107 arrives
  env.step(40);
  eq(JSON.stringify(env.regs()), '[1,1,2]');
  eq(env.state('fm') & 2, 2, 'form 1 carries the failure mark of the duplicate');
  eq(env.enas()[0], 1, 'form 1 is enabled first: its 107 wins over the mark (was form 2 only, forever)');
  eq(env.state('ls'), 2, 'LIVE');
  oneCallPerTick(env);
});

test('B18 a 101 inside the retry wait after a 112 (adversarial R2): the scheduled connect still happens; a 100 ends any back-off', () => {
  const env = makeEnv();
  env.load(); env.ui(); env.tick();
  env.ble(0, 112);
  env.tick();
  env.ble(0, 101);
  for (let i = 0; i < 20; i++) env.tick();
  eq(env.callsNamed('connect').length, 2, 'connect called again (was cancelled: SEARCHING for the whole session)');
  env.ble(0, 100);
  env.tick();
  eq(env.callsNamed('regUuid').length, 1, 'and the new connection is set up');
  // a 100 during a long back-off wait (the system's own reconnect, or a late success): setup starts at once
  const b = makeEnv();
  b.load(); b.ui(); b.tick();
  for (let k = 0; k < 7; k++) { b.ble(0, 112); while (b.state('rT') > 0) b.tick(); b.tick(); }
  b.ble(0, 112);
  b.tick();
  ok(b.state('rT') > 50, 'in the 60-tick back-off');
  b.ble(0, 100);
  b.tick();
  eq(b.callsNamed('regUuid').length, 1, 'regUuid on the next tick (was up to 60 s of CONNECTING with no setup call)');
});

test('B19 a stray 112 while connected and LIVE (adversarial R2b): no connect call, stays LIVE', () => {
  const env = rig({ 1: 'ok', 2: 'ok' }, { 1: 'data' });
  env.step(8);
  eq(env.state('ls'), 2);
  let n = 0;
  env.ctx.appConn.connect = () => { n++; throw new Error('Duktape BLE API err 1'); };
  const loads = env.extLoads.length;
  env.ble(0, 112);
  let live = 0;
  for (let t = 0; t < 600; t++) { env.step(); if (env.state('ls') === 2) live++; }
  eq(n, 0, 'no connect call (was 148 in 600 s, each compiling ext1.js)');
  eq(env.extLoads.length, loads, 'no ext file loaded');
  eq(live, 600, 'LIVE throughout');
});

const params = (settings) => {
  const env = makeEnv({ settings });
  env.load();
  env.tick();
  return env.callsNamed('connect')[0].args.slice(2).map((p) => Array.from(p));
};
const enc = (s) => Array.from(Buffer.from(s, 'utf8'));
const both = (name) => JSON.stringify([[9].concat(enc(name)), [8].concat(enc(name))]);
test('B2 search parameters: name only (no FFE0), complete + short name, every settings form, 16-byte cap', () => {
  eq(JSON.stringify(params({})), both('UltraBip'), 'empty: model name prefix');
  eq(JSON.stringify(params({ dm: '1' })), both('BlueBip'), 'BlueBip');
  const abel = both('UltraBip\u{1FA82}Abel');
  eq(JSON.stringify(params({ sn: 'Abel' })), abel, 'pilot name');
  eq(JSON.stringify(params({ sn: 'UltraBip\u{1FA82}Abel' })), abel, 'full name with the parachute');
  eq(JSON.stringify(params({ sn: 'UltraBip Abel' })), abel, 'full name with a space');
  eq(JSON.stringify(params({ sn: '  Abel ' })), abel, 'trimmed');
  eq(params({ sn: 'Abel' })[0].length, 17, 'type byte + 16 name bytes (the captured name)');
  eq(arr(params({ sn: 'Abel' })[0].slice(1)), arr([0x55, 0x6c, 0x74, 0x72, 0x61, 0x42, 0x69, 0x70, 0xf0, 0x9f, 0xaa, 0x82, 0x41, 0x62, 0x65, 0x6c]), 'bytes from the live capture');
  eq(JSON.stringify(params({ sn: '1234' })), both('UltraBip\u{1FA82}1234'), 'serial');
  eq(JSON.stringify(params({ dm: '1', sn: 'Abel' })), both('BlueBip\u{1FA82}Abel'), 'BlueBip with a name');
  eq(JSON.stringify(params({ sn: 'Abelxyzab' })), both('UltraBip\u{1FA82}Abel'), 'longer names are cut to 16 bytes');
  eq(JSON.stringify(params({ sn: 'Ábel' })), both('UltraBip\u{1FA82}Ábe'), '2-byte characters counted in bytes');
  eq(JSON.stringify(params({ sn: 'Abe\u{1FA82}' })), both('UltraBip\u{1FA82}Abe'), 'a 4-byte character that does not fit is dropped whole');
  eq(JSON.stringify(params({ sn: null })), both('UltraBip'), 'missing key');
  // adversarial R2-P2: phone keyboards capitalise, and the model setting may not match the vario
  for (const [dm, sn, name] of [
    ['0', 'Ultrabip Abel', 'UltraBip\u{1FA82}Abel'], ['0', 'ultrabip abel', 'UltraBip\u{1FA82}abel'],
    ['0', 'ULTRABIP ABEL', 'UltraBip\u{1FA82}ABEL'], ['0', 'BlueBip Abel', 'BlueBip\u{1FA82}Abel'],
    ['1', 'UltraBip Abel', 'UltraBip\u{1FA82}Abel'], ['0', 'UltraBip-Abel', 'UltraBip\u{1FA82}Abel'],
    ['0', 'UltraBip_Abel', 'UltraBip\u{1FA82}Abel'], ['0', 'UltraBip  Abel', 'UltraBip\u{1FA82}Abel'],
    ['0', 'UltraBip \u{1FA82} Abel', 'UltraBip\u{1FA82}Abel'], ['0', 'ultrabip', 'UltraBip'], ['1', 'BLUEBIP', 'BlueBip'],
    ['0', 'Ultra', 'UltraBip\u{1FA82}Ultr']
  ]) eq(JSON.stringify(params({ dm, sn })), both(name), 'model ' + dm + ' setting ' + JSON.stringify(sn) + ' (pilot name kept as typed)');
  for (const p of [params({}), params({ sn: 'Abel' })]) ok(!p.some((x) => x[0] === 2 || x[0] === 3), 'no 16-bit UUID filter next to a name');
});

test('B3 demo gate (demo variant): only (undefined, function) with no BLE event before; never on a watch; not in the store build', () => {
  const app = H.variant('demo');
  const src = fs.readFileSync(path.join(H.APP, 'main.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/demo|ext4|seenEv/.test(src), 'the store main.js has no demo code outside //@demo lines');
  const run = (o) => { const env = makeEnv(Object.assign({ app }, o)); env.load(); env.tick(); return env; };
  eq(run({ connectRet: undefined, zapp: 'fn' }).state('demo'), 1, 'simulator fingerprints');
  eq(run({ connectRet: undefined, zapp: 7 }).state('demo'), 0, 'watch: zapp id is a number');
  eq(run({ connectRet: 0, zapp: 'fn' }).state('demo'), 0, 'connection id 0');
  eq(run({ connectRet: 5, zapp: 'fn' }).state('demo'), 0, 'connection id 5');
  const env = makeEnv({ app, connectRet: 4, zapp: 'fn' });
  env.load(); env.tick();
  env.ble(0, 112);
  env.ctx.appConn.connect = () => undefined;
  for (let i = 0; i < 12; i++) env.tick();
  eq(env.state('demo'), 0, 'a BLE event was seen: never demo');
  for (const a of [app, H.APP]) {
    const w = makeEnv({ app: a, connectRet: undefined, zapp: 7 });
    w.load(); w.ui();
    for (let i = 0; i < 40; i++) w.tick();
    ok(!w.scr.visible('bt'), 'no DEMO tag on a watch');
    eq(w.output.con, 0);
    eq(w.state('ls'), 0, 'stays SEARCH');
  }
  const sim = makeEnv({ connectRet: undefined, zapp: 'fn' });
  sim.load(); sim.ui();
  for (let i = 0; i < 40; i++) sim.tick();
  ok(!sim.scr.visible('bt') && sim.scr.text('rs') === 'SEARCHING' && sim.output.con === 0, 'the store build in the simulator: SEARCHING, no demo');
  eq(sim.extLoads.filter((f) => f === 'ext4.js').length, 0, 'ext4.js is never loaded by the store build');
});

test('B4 stale and hysteresis: 3 empty ticks -> watch source, 2 good ticks -> LIVE; BAD DATA and recovery', () => {
  const env = connected();
  eq(env.state('ls'), 1, 'LINKING before the first line');
  lkTick(env, 1000, 1000, 0); env.tick();
  eq(env.state('ls'), 1, 'one good tick is not LIVE yet');
  lkTick(env, 1000, 1000, 0); env.tick();
  eq(env.state('ls'), 2, 'LIVE after two');
  env.tick(); env.tick();
  eq(env.state('ls'), 2, 'two empty ticks still LIVE');
  env.tick();
  eq(env.state('ls'), 3, 'STALE after three');
  eq(env.output.src, 1, 'src logged as watch');
  ok(env.scr.visible('s2') && env.scr.text('rs') === 'NO DATA', 'WATCH BARO + NO DATA');
  lkTick(env, 1000, 1000, 0); env.tick();
  eq(env.state('ls'), 3, 'one good tick: still STALE');
  lkTick(env, 1000, 1000, 0); env.tick();
  eq(env.state('ls'), 2, 'LIVE again');
  for (let i = 0; i < 12; i++) { env.feed(L(V.lk1.replace('*2A', '*00')).repeat(3)); env.tick(); }
  eq(env.state('ls'), 5, 'BAD DATA');
  eq(env.scr.text('rs'), 'BAD DATA');
  lkTick(env, 1000, 1000, 0); env.tick();
  lkTick(env, 1000, 1000, 0); env.tick();
  eq(env.state('ls'), 2, 'recovers');
});

test('B5 summary: [] before start; spec ids, order and formats; running thermal counts; imperial; XC entries only with the engine', () => {
  let env = connected();
  eq(JSON.stringify(env.summary()), '[]', 'never started');
  for (const pg of ['2', '0']) {
    env = climbSession({ settings: { pg } });
    let h = 1000, a0 = NaN, lo = 1e9;
    for (let i = 0; i < 20; i++) {
      lkTick(env, h, h - 1, -100); h -= 1; env.tick({ spd: 9, walt: h });
      if (a0 !== a0 && env.state('air')) a0 = env.output.alt; // the engine started with the exercise: no 12-tick history yet
      lo = Math.min(lo, env.output.alt);
    }
    for (let i = 0; i < 60; i++) { lkTick(env, h, h + 3, 300); h += 3; env.tick({ spd: 9, walt: h }); }
    const s = env.summary();
    const id = (k) => s.find((x) => x.id === k);
    // v1.1 order (XC addendum §5.3): a watch that shows only the first 4-5 entries drops the least useful
    eq(s.map((x) => x.id).join(), pg === '2' ? 'f,a,c,g,l' : 'f,a,h,c,t,g,l', 'pg ' + pg);
    eq(id('f').format + id('a').format + id('c').format + id('g').format + id('l').format,
      'Duration_FourdigitsFixedAltitude_FivedigitsOneDecimal_FourdigitsAltitude_FivedigitsPercentage_Threedigits');
    eq(id('c').postfix, 'm/s');
    near(id('c').value, 3.0, 0.05, 'best climb');
    near(id('a').value, env.state('maxA'), 1e-9, 'max altitude');
    eq(id('f').value, 80, 'flight time');
    near(id('g').value, 180, 6, 'a thermal still running counts');
    ok(id('l').value > 90 && id('l').value <= 100, 'link percentage');
    if (pg === '0') {
      // take-off detected 8 ticks after the speed came (ticks 1-8), the take-off altitude is from 12 ticks before
      near(id('h').value, id('a').value - a0, 0.01, 'max above take-off');
      const climb = id('a').value - lo;
      ok(id('t').value <= climb + 0.01 && id('t').value > climb - 3, 'total climb ' + id('t').value + ' within 3 m (hysteresis) below the ' + climb.toFixed(1) + ' m climbed');
      eq(id('h').format + id('t').format, 'Altitude_FivedigitsAltitude_Fivedigits');
    }
    env.input.um = 1;
    env.tick({ spd: 9 });
    const ci = env.summary().find((x) => x.id === 'c');
    eq(ci.format, 'Count_Fourdigits');
    eq(ci.postfix, 'ft/min');
    near(ci.value, 590, 10, '3.0 m/s in ft/min');
  }
});

test('B2b vario name in Duktape (the watch engine) with settings that arrive as raw UTF-8: parachute found by code point (platform P1)', () => {
  const duk = ['/opt/homebrew/bin/duk', '/usr/local/bin/duk'].find((p) => fs.existsSync(p));
  if (!duk) { console.log('     skipped: no duk binary (brew install duktape)'); return; }
  const cases = [ // [model, setting as UTF-8 hex (raw: pushed as bytes, as the firmware does from data.jsn) or a JS literal, expected name]
    [0, 'raw:556c747261426970f09faa824162656c', 'UltraBip\u{1FA82}Abel'],
    [0, 'raw:f09faa824162656c', 'UltraBip\u{1FA82}Abel'],
    [0, 'raw:4162656c', 'UltraBip\u{1FA82}Abel'],
    [0, 'raw:556c74726142697020416265', 'UltraBip\u{1FA82}Abe'],
    [0, 'raw:c38162656c', 'UltraBip\u{1FA82}Ábe'],
    [1, 'raw:41f09faa82', 'BlueBip\u{1FA82}A\u{1FA82}'],
    [0, 'lit:UltraBip\\uD83E\\uDE82Abel', 'UltraBip\u{1FA82}Abel'],
    [0, 'lit:\\uD83E\\uDE82Abel', 'UltraBip\u{1FA82}Abel'],
    [0, 'lit:', 'UltraBip'],
    [0, 'raw:756c747261626970f09faa824162656c', 'UltraBip\u{1FA82}Abel'],
    [0, 'raw:426c7565426970204162', 'BlueBip\u{1FA82}Ab']
  ];
  const os = require('os');
  const { execFileSync } = require('child_process');
  const js = 'var f = (\n' + H.minifiedExt('ext1.js') + '\n);\n' +
    'var raw = String.fromBufferRaw(Duktape.dec("hex", "556c747261426970f09faa824162656c"));\n' +
    'print(JSON.stringify([raw.length, raw.charCodeAt(8)]));\n' +
    cases.map(([m, s]) => 'print(JSON.stringify(f(' + m + ', ' + (s.startsWith('raw:') ? 'String.fromBufferRaw(Duktape.dec("hex", "' + s.slice(4) + '"))' : '"' + s.slice(4) + '"') + ')));').join('\n') + '\n';
  const file = path.join(os.tmpdir(), 'blevario-ext1-duk-' + process.pid + '.js');
  fs.writeFileSync(file, js);
  const out = execFileSync(duk, [file], { encoding: 'utf8' }).trim().split('\n').map((l) => JSON.parse(l));
  fs.unlinkSync(file);
  eq(JSON.stringify(out[0]), JSON.stringify([13, 0x1FA82]), 'premise: Duktape keeps a raw-UTF-8 U+1FA82 as one character');
  cases.forEach(([m, s, name], i) => eq(JSON.stringify(out[i + 1]), both(name), 'model ' + m + ' setting ' + s));
});

test('B5b summary without a detected take-off: only the link entry, no false 0 m maximum altitude (product P1)', () => {
  const env = climbSession();
  let h = 1000;
  for (let i = 0; i < 300; i++) { const r = i < 150 ? 0.3 : 0.6; lkTick(env, h, h + r, r * 100); h += r; env.tick({ spd: 1.2 }); }
  eq(env.state('air'), 0, 'hiking up, no take-off');
  const s = env.summary();
  eq(s.map((x) => x.id).join(), 'l', 'only the vario link');
  ok(s[0].value > 90, 'link percentage ' + s[0].value);
});

test('B6 settings: null, "abc", "9", "1.5", "-1", "" fall back to the defaults; valid values are used', () => {
  const name = (e) => { e.tick(); return Buffer.from(Array.from(e.callsNamed('connect')[0].args[2]).slice(1)).toString('utf8'); }; // searched name
  for (const bad of [null, 'abc', '9', '1.5', '-1', '']) {
    const env = makeEnv({ settings: { aw: bad, ar: bad, sk: bad, gp: bad, dm: bad, pg: bad, hr: bad } });
    env.load();
    const S = env.state('S');
    eq(S.pg, 2, 'pg ' + bad);
    eq(S.hr, 0, 'hr ' + bad);
    eq(S.aw, 10, 'aw ' + bad);
    eq(S.ar, 0, 'ar ' + bad);
    near(S.sk, -2.45, 1e-9, 'sk ' + bad);
    eq(S.gp, 0);
    eq(name(env), 'UltraBip', 'dm ' + bad);
    const d = makeEnv({ app: H.variant('demo'), settings: { dp: bad } });
    d.load();
    eq(d.state('S').dp, 0, 'demo variant: dp ' + bad);
  }
  const env = makeEnv({ settings: { aw: '2', ar: '1', sk: '0', gp: '1', dm: '1', sn: 'Abel', pg: '2', hr: '1' } });
  env.load();
  const S = env.state('S');
  eq(S.pg, 2);
  eq(S.hr, 1);
  eq(S.aw, 20);
  eq(S.ar, 1);
  eq(S.sk, -9999, 'Off');
  eq(S.gp, 1);
  eq(name(env), 'BlueBip\u{1FA82}Abel', 'dm 1, sn Abel');
  const d = makeEnv({ app: H.variant('demo'), settings: { dp: '13' } });
  d.load();
  eq(d.state('S').dp, 13);
  const e7 = makeEnv({ app: H.variant('demo'), settings: { dp: '7' } });
  e7.load();
  eq(e7.state('S').dp, 0, 'dp 7 is not a phase');
  eq(JSON.stringify(Object.keys(H.DATA)), JSON.stringify(['dm', 'sn', 'ar', 'aw', 'sk', 'gp', 'pg']), 'data.json holds only the seven settings (Height shown dropped with TO, 2026-10-04)');
  eq(H.DATA.pg, '1', 'default: the classic page (stored index 1 since the HIKE page was dropped; the automatic pages push a second app out of memory on a Race S)');
});

test('B7 two hours of 10 Hz LK8EX1 + LXWP0 + 1 Hz GGA/RMC, random chunking, injected garbage: bounded state', () => {
  const env = climbSession({ settings: { gp: '1' } });
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let h = 1500, accepted = 0;
  for (let t = 0; t < 7200; t++) {
    const rate = 2 * Math.sin(t / 60);
    let s = '';
    for (let i = 0; i < 10; i++) {
      h += rate / 10;
      s += lk8(Math.round(pressureAt(h)), Math.round(h), Math.round(rate * 100)) + sentence('LXWP0,N,,' + h.toFixed(1) + ',' + rate.toFixed(2) + ',,,,,,,,');
    }
    s += L(V.gga) + sentence('GPRMC,120000.00,A,4600.000,N,00800.000,E,18.0,' + ((t * 7) % 360) + '.0,031026,,,A,V');
    if (t % 97 === 0) s += 'garbage$LK8EX1,12,*' + '\r\n';
    const b = bytes(s);
    for (let i = 0; i < b.length;) { const k = 1 + Math.floor(rnd() * 124); env.ble(1, 106, b.slice(i, i + k)); i += k; }
    accepted += env.state('bN');
    env.tick({ spd: 9 });
  }
  eq(accepted, 72000, 'every LK8EX1 accepted');
  ok(env.state('nBad') <= 75, 'only the injected garbage is bad: ' + env.state('nBad'));
  ok(env.state('len') <= 96, 'line length bounded');
  eq(env.state('ls'), 2, 'still LIVE');
  near(env.state('gsp'), 18 * 0.514444, 1e-6, 'vario GPS speed');
  eq(env.scr.lost.length, 0, 'no lost setText');
});

// ======================= UI =======================
test('U1 searching screen: WATCH BARO, SEARCHING, watch vario; after 30 s on the ground two static hint lines', () => {
  const env = makeEnv();
  env.load();
  env.ui();
  env.input.wvs = 1.26;
  env.tick();
  ok(env.scr.visible('s2') && !env.scr.visible('s0'), 'WATCH BARO');
  eq(env.scr.text('rs'), 'SEARCHING');
  ok(!env.scr.visible('fl'), 'no flight time on the ground while searching');
  eq(env.scr.text('nm'), '+1.3', 'watch vertical speed shown');
  eq(env.output.src, 1);
  for (let i = 0; i < 29; i++) env.tick();
  ok(!env.scr.visible('h0') && !env.scr.visible('h1'), 'no hint in the first 30 ticks');
  env.tick();
  ok(env.scr.visible('h0') && env.scr.visible('h1'), 'both hint lines');
  ok(!env.scr.visible('av') && !env.scr.visible('la') && !env.scr.visible('lg') && !env.scr.visible('gn'), 'rows replaced by the hint');
  eq(env.scr.lost.length, 0, 'no setText on hidden elements: ' + env.scr.lost.join());
});

test('U2 live screen: VARIO, colours, AVG window, FLT; imperial uses the smaller ft/min number', () => {
  const env = climbSession();
  let h = 1000;
  for (let i = 0; i < 12; i++) { lkTick(env, h, h + 2.3, 230, 10, 1087); h += 2.3; env.tick({ spd: 9 }); }
  sameSet(env.scr.shown().filter((id) => /^(s0|s2|bt|la|lg|av|gn|h0|h1|vn|vi|nm|ni|fl|rs|gp)$/.test(id)), ['la', 'lg', 'av', 'gn', 'vn', 'nm', 'fl'], 'visible set');
  ok(!env.scr.visible('s0') && !env.scr.visible('s2'), 'no static VARIO line while the vario is live (owner request 2026-10-04)');
  eq(env.scr.text('nm'), '+2.3');
  eq(env.scr.el.nm.color, '#c-green');
  eq(env.scr.text('av'), '+2.3');
  eq(env.scr.text('la'), 'AVG 10s');
  env.input.um = 1;
  lkTick(env, h, h + 2.4, 240); h += 2.4; env.tick();
  ok(env.scr.visible('ni') && !env.scr.visible('nm'), 'imperial uses vi');
  eq(env.scr.text('ni'), '+470');
  eq(env.scr.el.ni.color, '#c-green', 'colour follows the element switch');
  env.input.um = 0;
  lkTick(env, h, h + 12.4, 1240); h += 12.4; env.tick();
  eq(env.scr.text('nm'), '+12.4', 'metric stays in the large number');
  lkTick(env, h, h - 3, -300, 10, 1004); h -= 3; env.tick();
  eq(env.scr.text('nm'), '-3.0');
  eq(env.scr.el.nm.color, '#c-red');
  eq(env.scr.lost.length, 0, 'no lost setText: ' + env.scr.lost.join());
});

test('U3 every link state shows its reason; airborne keeps FLT in every state', () => {
  const env = connected();
  const bottom = () => ['fl', 'rs', 'gp'].filter((id) => env.scr.visible(id)).map((id) => (id === 'rs' ? env.scr.text('rs') : id)).join();
  eq(bottom(), 'CONNECTING');
  lkTick(env, 1000, 1000, 0); env.tick();
  lkTick(env, 1000, 1000, 0); env.tick();
  eq(bottom(), 'fl', 'LIVE shows FLT');
  env.tick(); env.tick(); env.tick();
  eq(bottom(), 'NO DATA');
  env.ble(0, 101); env.tick();
  eq(bottom(), 'LINK LOST');
  ok(env.scr.visible('s2'), 'WATCH BARO');
  const air = climbSession();
  let h = 1000;
  for (let i = 0; i < 10; i++) { lkTick(air, h, h - 1, -100); h -= 1; air.tick({ spd: 9 }); }
  eq(air.state('air'), 1);
  air.ble(0, 101);
  for (let i = 0; i < 40; i++) air.tick({ spd: 9 });
  eq(['fl', 'rs', 'gp'].filter((id) => air.scr.visible(id)).join(), 'fl', 'airborne: FLT stays');
  ok(!air.scr.visible('h0') && !air.scr.visible('h1'), 'no hints in flight');
});

test('U4 view reload: a fresh template is fully re-pushed within 2 ticks; overlay recovery within 5 ticks', () => {
  const env = climbSession();
  let h = 1000;
  for (let i = 0; i < 12; i++) { lkTick(env, h, h + 1, 100); h += 1; env.tick(); }
  env.scr = new H.Screen();
  env.ui();
  lkTick(env, h, h + 1, 100); h += 1; env.tick();
  eq(env.scr.text('nm'), '+1.0');
  eq(env.scr.text('av'), '+1.0');
  ok(!env.scr.visible('s0') && !env.scr.visible('s2'), 'no static VARIO line while the vario is live (owner request 2026-10-04)');
  eq(env.scr.text('la'), 'AVG 10s');
  ok(!env.scr.visible('s0') && !env.scr.visible('s2'), 'status re-pushed: live, no status line');
  env.scr = new H.Screen();
  for (let i = 0; i < 5; i++) { lkTick(env, h, h + 1, 100); h += 1; env.tick(); }
  eq(env.scr.text('nm'), '+1.0', 'recovered within 5 ticks');
  ok(!env.scr.visible('s2'), 'still live');
});

test('U4b view activation without getUserInterface (platform R2-P2): onActivate -> onEvent -> full repaint on the next tick', () => {
  const env = climbSession();
  let h = 1000;
  for (let i = 0; i < 13; i++) { lkTick(env, h, h + 1, 100); h += 1; env.tick({ spd: 9 }); }
  ok(env.state('tk') % 5 !== 4, 'the next tick is not a periodic full push');
  env.scr = new H.Screen(); // the firmware rebuilt the view from the template after a lap or an overlay
  env.event(1); // the template's onActivate: $.put('/Zapp/{zapp_index}/Event', 1, null, 'int32')
  lkTick(env, h, h + 1, 100); h += 1; env.tick({ spd: 9 });
  ok(!env.scr.visible('s0') && !env.scr.visible('s2'), 'live: not the template\'s WATCH BARO, no static VARIO');
  eq(env.scr.text('nm'), '+1.0', 'climb (template: --)');
  eq(env.scr.text('av'), '+1.0', 'average (template: --)');
  ok(!env.scr.visible('rs'), 'no SEARCHING');
  ok(env.scr.visible('fl'), 'flight time row');
  eq(env.scr.el.nm.color, '#c-green', 'colour pushed again');
  eq(env.scr.lost.length, 0, 'no lost setText');
  ok(/onActivate="\s*\$\.put\('\/Zapp\/\{zapp_index\}\/Event', 1, null, 'int32'\);/.test(H.HTML), 'v.html sends event 1 from uiView onActivate');
  const d = connected({ app: H.variant('dbg') });
  d.event(1);
  ok(d.logs.includes('[vl] onEvent 1'), 'debug builds log the activation (hardware check H11)');
  eq(env.logs.filter((l) => /onEvent/.test(l)).length, 0, 'store builds do not');
});

test('U5b light theme (product R2-P1): the climb number uses the darker green; dark theme keeps the bright one', () => {
  const run = (light) => {
    const env = connected({ light });
    for (let i = 0; i < 3; i++) { lkTick(env, 1000, 1000, 230); env.tick(); }
    return env.scr.el.nm.color;
  };
  eq(run(true), '#c-darkgreen', 'light theme: #2E9E41 on white, about 3.5:1 (#3FF07F is about 1.5:1)');
  eq(run(false), '#c-green', 'dark theme');
  const env = connected({ light: true });
  for (let i = 0; i < 3; i++) { lkTick(env, 1000, 1000, -300); env.tick(); }
  eq(env.scr.el.nm.color, '#c-red', 'red in both themes (3.4:1 on white)');
});

test('U5 colour is optional: when getStyle returns nothing no colour is set and nothing breaks', () => {
  const env = connected({ noStyle: true });
  lkTick(env, 1000, 1000, 250); env.tick();
  lkTick(env, 1000, 1000, 250); env.tick();
  eq(env.scr.el.nm.color, undefined);
  eq(env.scr.text('nm'), '+2.5');
});

test('U6 vario GPS line (product R2-P1; text since v1.1): flight time until the first fix, fix held 10 s, NO GPS FIX up to 30 s, then flight time', () => {
  const env = climbSession({ settings: { gp: '1' } });
  let h = 1000;
  const fix = (st) => env.feed(sentence('GPRMC,120000.00,' + st + ',4600.000,N,00800.000,E,18.9,245.0,031026,,,A,V'));
  const row = () => ['fl', 'rs', 'gp'].filter((id) => env.scr.visible(id)).map((id) => (id === 'rs' ? env.scr.text('rs') : id)).join();
  const quiet = (n) => { for (let i = 0; i < n; i++) { lkTick(env, h, h, 0); env.tick(); } };
  quiet(40);
  eq(row(), 'fl', 'no fix ever (BlueBip, or no RMC): flight time, not a permanent NO GPS FIX');
  for (let i = 0; i < 3; i++) { lkTick(env, h, h, 0); fix('A'); env.tick(); }
  eq(row(), 'gp', 'GPS line with a fresh fix');
  eq(env.scr.text('gp'), 'GPS 245\u00b0 35 km/h', 'course and speed (18.9 kn), app-formatted since v1.1');
  quiet(9);
  eq(row(), 'gp', 'held for 10 s without RMC (1 RMC in 26 s in the 2023 log)');
  quiet(1);
  eq(row(), 'NO GPS FIX', 'fix older than 10 s');
  quiet(19);
  eq(row(), 'NO GPS FIX', 'still within 30 s of the last fix');
  quiet(1);
  eq(row(), 'fl', 'no fix for 30 s: flight time again');
  for (let i = 0; i < 2; i++) { lkTick(env, h, h, 0); fix('A'); env.tick(); }
  eq(row(), 'gp', 'a new fix brings the line back');
  lkTick(env, h, h, 0); fix('V'); env.tick();
  eq(row(), 'NO GPS FIX', 'status V: no fix at once');
  near(env.state('gsp'), 18.9 * 0.514444, 1e-6, 'a V line does not overwrite the last valid speed');
  env.input.um = 1;
  for (let i = 0; i < 2; i++) { lkTick(env, h, h, 0); fix('A'); env.tick(); }
  eq(env.scr.text('gp'), 'GPS 245\u00b0 22 mph', 'imperial');
  eq(env.scr.lost.length, 0, 'no lost setText: ' + env.scr.lost.join());
  const off = climbSession();
  for (let i = 0; i < 3; i++) { lkTick(off, h, h, 0); off.feed(sentence('GPRMC,120000.00,A,4600.000,N,00800.000,E,18.9,245.0,031026,,,A,V')); off.tick(); }
  ok(off.scr.visible('fl') && !off.scr.visible('gp'), 'setting off: flight time');
  near(off.state('gsp'), 18.9 * 0.514444, 1e-6, 'speed still parsed');
});

test('U7 demo variant in the simulator: DEMO tag, flying state, synthetic stream drives LIVE, NO DATA and the red sink', () => {
  const app = H.variant('demo');
  const env = makeEnv({ app, connectRet: undefined, zapp: 'fn' });
  env.load();
  env.ui();
  env.start(); // the simulator starts the exercise
  env.tick();
  eq(env.state('demo'), 1);
  eq(env.output.con, 1, 'Searching view closed at once');
  eq(env.scr.text('bt'), 'DEMO');
  env.tick();
  eq(env.state('ls'), 2, 'LIVE from the synthetic stream');
  ok(!env.scr.visible('s0') && !env.scr.visible('s2'), 'live: no status line');
  eq(env.state('am'), 0, 'demo keeps the default ALT mode (store screenshots show what users get)');
  eq(env.scr.text('ll'), 'ALT');
  near(env.output.alt, 1504, 20, 'synthetic altitude');
  ok(env.output.vs > 1.5 && env.output.vs < 3.2, 'thermal climb ' + env.output.vs);
  eq(env.output.ft, 722, 'seeded 720 s, plus the two running ticks');
  ok(env.state('gsp') > 7 && env.state('gsp') < 13, 'synthetic GPS speed');
  const states = new Set();
  let red = false;
  for (let i = 0; i < 128; i++) {
    env.tick();
    states.add(env.state('ls'));
    if (env.scr.visible('nm') && env.scr.el.nm.color === '#c-red') red = true;
  }
  ok(states.has(2) && states.has(3), 'LIVE and NO DATA both appear: ' + [...states]);
  ok(red, 'strong sink turns red');
  ok(env.state('th') === 1 || env.state('lastG') > 50, 'a thermal was detected');
  ok(env.state('nBad') >= 3, 'wrong checksums injected every 40th line are rejected');
  eq(env.scr.lost.length, 0, 'no lost setText');
  const st = makeEnv({ app, connectRet: undefined, zapp: 'fn', settings: { dp: '11' } });
  st.load(); st.ui(); st.tick(); st.tick(); st.tick();
  ok(!st.scr.visible('bt') && !st.scr.visible('s0'), 'dp 11: no DEMO tag (store screenshots)');
  eq(st.scr.el.nm.color, '#c-red', 'dp 11 starts in the strong sink');
  const p2 = makeEnv({ app, connectRet: undefined, zapp: 'fn', settings: { dp: '2' } });
  p2.load(); p2.ui();
  for (let i = 0; i < 5; i++) p2.tick();
  ok(p2.scr.visible('s2') && p2.scr.visible('fl') && !p2.scr.visible('rs'), 'dp 2: in flight, WATCH BARO with FLT');
  eq(p2.state('air'), 1);
  const p3 = makeEnv({ app, connectRet: undefined, zapp: 'fn', settings: { dp: '3' } });
  p3.load(); p3.ui();
  for (let i = 0; i < 32; i++) p3.tick();
  ok(p3.scr.text('rs') === 'SEARCHING' && p3.scr.visible('h0'), 'dp 3: SEARCHING with the hint');
  const p4 = makeEnv({ app, connectRet: undefined, zapp: 'fn', settings: { dp: '4' } });
  p4.load(); p4.ui();
  for (let i = 0; i < 4; i++) p4.tick();
  eq(p4.state('fsec'), 0, 'dp 4: on the ground');
  ok(p4.scr.visible('fl') && !p4.scr.visible('s2'));
});

test('U8 GAIN in a thermal, LAST after it ends, GAIN again in the next (product P2)', () => {
  const env = climbSession();
  let h = 2000;
  const run = (n, rate) => { for (let i = 0; i < n; i++) { lkTick(env, h, h + rate, rate * 100); h += rate; env.tick({ spd: 9, walt: h + 300 }); } };
  run(40, -1);
  eq(env.scr.text('lg'), 'GAIN', 'before the first thermal');
  run(60, 2);
  eq(env.state('th'), 1);
  eq(env.scr.text('lg'), 'GAIN', 'in the thermal');
  run(25, -1);
  eq(env.state('th'), 0);
  eq(env.scr.text('lg'), 'LAST', 'the last thermal');
  ok(env.output.gn > 100, 'its gain still shown');
  run(30, 2);
  eq(env.state('th'), 1);
  eq(env.scr.text('lg'), 'GAIN', 'the next thermal');
  eq(env.scr.lost.length, 0, 'no lost setText');
});

// ======================= XC pages, ground speed, heights, circling and wind (v1.1, XC_FEATURES.md MVP-A) =======================
const XT = require('./xctrack');
// A connected vario, the exercise started (automatic pages unless o.settings.pg says otherwise), airborne after 8 ticks
// of speed. fly(fix, opts) runs one tick: one LK8EX1 line at altitude h (climb rate r m/s), the watch fix and speed.
const xcEnv = (o) => {
  const env = connected(Object.assign({}, o, { settings: Object.assign({ pg: '0' }, o && o.settings) }));
  env.start();
  env.h = 1500;
  env.woff = 0; // the watch altitude minus the vario's
  env.fly = (fix, x) => {
    x = x || {};
    const r = x.r === undefined ? 0 : x.r;
    if (x.link !== false) env.feed(lk8(Math.round(pressureAt(env.h + r)), Math.round(env.h + r), Math.round(r * 100)));
    env.h += r;
    return env.tick(Object.assign({ la: fix ? fix[0] : undefined, lo: fix ? fix[1] : undefined, spd: 9, walt: env.h + env.woff }, x.input));
  };
  return env;
};
const XC = (env) => env.state('XC');
// Runs a synthetic track through the whole app; returns per-run results for the §3.7 statistics.
const windRun = (p, o) => {
  const tr = XT.track(p);
  const env = xcEnv(o);
  let circ = 0, firstC = -1, firstW = -1, nEst = 0, last = 0, first = null;
  tr.fix.forEach((f, i) => {
    env.fly(f);
    const x = XC(env);
    if (x[1] >= 2) { circ++; if (firstC < 0) firstC = i; }
    if (x[14] !== last && x[14] > 0) { nEst++; last = x[14]; if (!first) { firstW = i; first = XT.windErr(x[11], x[12], tr); } }
  });
  const x = XC(env);
  return { env, tr, circ, firstC, firstW, nEst, first, shown: x[13] ? XT.windErr(x[11], x[12], tr) : null };
};
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const windBatch = (p, runs) => {
  const R = [];
  for (let i = 0; i < runs; i++) R.push(windRun(Object.assign({ V: 9.5, T: 22, n: 90, noise: 2, mode: 'circle', wob: 1, from: 270, W: 5 }, p, { seed: 1000 + i * 7919 })));
  const shown = R.filter((r) => r.shown), firsts = R.filter((r) => r.first);
  return {
    valid: shown.length / runs,
    sp: shown.length ? rms(shown.map((r) => r.shown.sp)) : NaN, dir: shown.length ? rms(shown.map((r) => r.shown.dir)) : NaN,
    fsp: firsts.length ? rms(firsts.map((r) => r.first.sp)) : NaN, fdir: firsts.length ? rms(firsts.map((r) => r.first.dir)) : NaN,
    est: R.reduce((s, r) => s + r.nEst, 0), circ: R.reduce((s, r) => s + r.circ, 0), R
  };
};

test('X1 circling wind through the app (T-W1): 22-s circles in 5 m/s from 270, 2 m GPS noise: first estimate and displayed wind within the addendum limits; any wind direction', () => {
  const b = windBatch({}, 30);
  eq(b.valid, 1, 'every run has a wind');
  ok(b.fsp <= 0.6 && b.fdir <= 8, 'first estimate RMS ' + b.fsp.toFixed(2) + ' m/s, ' + b.fdir.toFixed(1) + ' deg (limit 0.6, 8)');
  ok(b.sp <= 0.3 && b.dir <= 4, 'displayed after 4 circles RMS ' + b.sp.toFixed(2) + ' m/s, ' + b.dir.toFixed(1) + ' deg (limit 0.3, 4)');
  for (const from of [0, 45, 135, 200, 315]) {
    const d = windBatch({ from }, 8);
    ok(d.valid === 1 && d.sp <= 0.3 && d.dir <= 4, 'from ' + from + ': ' + d.sp.toFixed(2) + ' m/s, ' + d.dir.toFixed(1) + ' deg');
  }
  const r = b.R[0];
  const out = r.env.output;
  near(out.ws, Math.hypot(XC(r.env)[11], XC(r.env)[12]), 1e-6, 'logged wind speed (m/s)');
  near(out.wd, 1.5 * Math.PI, 0.1, 'logged wind-from direction in rad, 0..2pi (270 deg)');
  ok(XC(r.env)[0] < 3 || !r.env.scr.visible('gp'), 'the map page shows no wind line (owner 2026-10-05); GLIDE does (X13)');
  eq(Math.round(Math.hypot(XC(r.env)[11], XC(r.env)[12]) * 3.6), 18, 'wind 18 km/h');
});

test('X2 wind cases (T-W1): 2/8 m/s, wind stronger than the airspeed, 18-s and 30-s circles, 4 m noise, 20 % late ticks, recentring, calm', () => {
  let b = windBatch({ W: 2 }, 15);
  ok(b.valid === 1 && b.dir <= 12, 'W 2: ' + b.dir.toFixed(1) + ' deg (limit 12)');
  b = windBatch({ W: 8 }, 15);
  ok(b.valid === 1 && b.dir <= 4, 'W 8: ' + b.dir.toFixed(1) + ' deg (limit 4)');
  b = windBatch({ W: 11.5, n: 120 }, 15);
  ok(b.valid === 1 && b.sp <= 0.5 && b.dir <= 5, 'W 11.5 > V 9.5: ' + b.sp.toFixed(2) + ' m/s, ' + b.dir.toFixed(1) + ' deg (limit 0.5, 5)');
  for (const T of [18, 30]) {
    b = windBatch({ T, n: T === 30 ? 120 : 90 }, 15);
    ok(b.valid === 1 && b.sp <= 0.6 && b.dir <= 8, T + '-s circles: ' + b.sp.toFixed(2) + ' m/s, ' + b.dir.toFixed(1) + ' deg (limit 0.6, 8)');
  }
  b = windBatch({ noise: 4 }, 30);
  ok(b.valid >= 0.8, '4 m noise: ' + Math.round(b.valid * 100) + ' % of runs with a wind (limit 80 %)');
  b = windBatch({ dup: 0.2 }, 30);
  ok(b.valid >= 0.9, '20 % late ticks: ' + Math.round(b.valid * 100) + ' % (limit 90 %)');
  b = windBatch({ recentre: 1 }, 15);
  ok(b.valid === 1 && b.sp <= 0.3 && b.dir <= 4, 'recentring: ' + b.sp.toFixed(2) + ' m/s, ' + b.dir.toFixed(1) + ' deg');
  b = windBatch({ W: 0 }, 15);
  ok(b.valid === 1 && b.sp <= 0.4, 'calm: ' + b.sp.toFixed(2) + ' m/s shown (limit 0.4)');
});

test('X3 no false circling and no wind (T-W1): straight glides 30 min at 2/4/6 m noise, S-turns and ridge reversals at 2/4 m, a 3/4 circle', () => {
  for (const noise of [2, 4, 6]) {
    const b = windBatch({ mode: 'straight', n: 1800, noise }, 3);
    eq(b.circ + b.est, 0, 'straight glide, ' + noise + ' m noise: circling ticks + estimates');
  }
  for (const mode of ['sturn', 'ridge']) {
    for (const noise of [2, 4]) {
      const b = windBatch({ mode, n: 600, noise }, 3);
      eq(b.circ + b.est, 0, mode + ', ' + noise + ' m noise');
    }
  }
  const b = windBatch({ mode: 'part', n: 120 }, 30);
  ok(b.valid <= 0.02, '3/4 circle then straight: ' + Math.round(b.valid * 100) + ' % with a wind (limit 2 %)');
});

test('X4 latency (T-W1): THERMAL about 0.9 circle after the turn starts, the first wind within 1.2 circles; spiral in sink stays GLIDE', () => {
  for (const T of [18, 22, 30]) {
    const c = [], w = [];
    for (let i = 0; i < 9; i++) {
      const tr = XT.track({ W: 5, from: 270, V: 9.5, T, n: 60 + 3 * T, noise: 2, mode: 'lead', wob: 1, seed: 500 + i * 131 });
      const env = xcEnv();
      let page = -1, wind = -1;
      tr.fix.forEach((f, k) => {
        env.fly(f, { r: k < 60 ? -1 : 1.5 });
        if (page < 0 && XC(env)[0] === 3) page = k - 60;
        if (wind < 0 && XC(env)[13]) wind = k - 60;
      });
      c.push(page); w.push(wind);
    }
    c.sort((a, b) => a - b); w.sort((a, b) => a - b);
    ok(c[0] > 0 && c[4] <= T, T + '-s circles: THERMAL after (median) ' + c[4] + ' s (one circle: ' + T + ' s)');
    ok(w[0] > 0 && w[8] <= 1.2 * T + 2, T + '-s circles: first wind after (max) ' + w[8] + ' s (1.2 circles: ' + (1.2 * T) + ' s)');
  }
  const tr = XT.track({ W: 5, from: 270, V: 12, T: 10, n: 160, noise: 2, mode: 'lead', seed: 3 });
  const env = xcEnv();
  tr.fix.forEach((f, k) => env.fly(f, { r: k < 60 ? -1 : -8 }));
  ok(XC(env)[1] >= 2, 'a spiral is circling');
  eq(XC(env)[0], 2, 'but the page stays GLIDE (30-s average below -0.5 m/s, XCTrack rule)');
});

// The wind store (ext7.js) fed directly with exact circles: XCSoar's quality x age x height weights.
test('X5 wind store: an estimate at 1500 m and one at 2500 m, shown at 2400 m, is weighted by height (and age); take-off clears it', () => {
  const vmod = require('vm');
  const ctx = vmod.createContext({ Math, Float32Array });
  const E = new Float32Array(40), N = new Float32Array(40), X = new Float32Array(16);
  const W = vmod.runInContext('(' + fs.readFileSync(path.join(H.APP, 'ext7.js'), 'utf8') + ')', ctx)(E, N, X);
  const circle = (we, wn) => { for (let k = 0; k < 40; k++) { const a = -k * 2 * Math.PI / 20; E[k] = we + 9 * Math.sin(a); N[k] = wn + 9 * Math.cos(a); } };
  circle(-5, 0); // wind from the east at 1500 m (wind-to west)
  ok(W(100, 1500, 1, 40, 0, -5, 0, 1) >= 20, 'a full turn fits');
  near(X[11], -5, 1e-3); near(X[12], 0, 1e-3);
  circle(0, -6); // wind from the north at 2500 m
  ok(W(130, 2500, 1, 40, 0, 0, -6, 1) >= 20);
  W(140, 2400, 0, 40, 0, 0, 0, 1); // shown at 2400 m (refresh every 10 ticks)
  const age = (t) => { t /= 3600; return 0.0025 * (1 - t) / (t * t + 0.0025); }, ht = (d) => { d /= 1000; return 2 / (1 + d * d) - 1; };
  const wa = 3 * age(40) * ht(900), wb = 3 * age(10) * ht(100);
  near(X[11], (-5 * wa) / (wa + wb), 1e-3, 'east component');
  near(X[12], (-6 * wb) / (wa + wb), 1e-3, 'north component: mostly the 2500 m estimate');
  ok(wb / (wa + wb) > 0.9, 'weight of the nearer estimate ' + (wb / (wa + wb)).toFixed(3));
  W(150, 4000, 0, 40, 0, 0, 0, 1);
  eq(X[13], 0, 'every estimate is more than 1000 m away: no wind');
  W(160, 2500, -1, 40, 0, 0, 0, 1);
  W(170, 2500, 0, 40, 0, 0, 0, 1);
  eq(X[13], 0, 'take-off reset');
  circle(3, 4);
  for (const g of [[1, 1, 0], [9, 2, 0]]) { // a line (radius 0) and a too-small radius are rejected
    for (let k = 0; k < 40; k++) { E[k] = g[0] * Math.sin(k); N[k] = g[2]; }
    eq(W(200, 2500, 1, 40, 0, 0, 0, 1), 0, 'rejected');
  }
});

test('X6 pages (T-P1): classic before the start, GLIDE on the ground and after take-off (no HIKE page since 2026-10-04), THERMAL while circling in lift, GLIDE again after 20 s and after landing', () => {
  const env = connected({ settings: { pg: '0' } });
  const shown = (ids) => ids.filter((id) => env.scr.visible(id)).join();
  env.input.walt = 1500; // the watch altitude agrees with the vario (the match-watch offset is then 0 from the start)
  lkTick(env, 1500, 1500, 0); env.tick();
  eq(XC(env)[0], 0, 'before the exercise starts: the classic page');
  ok(!env.scr.visible('cv') && !env.scr.visible('cl') && env.scr.visible('ac') && !env.scr.visible('ax'), 'no C2 slot on the classic page, centred altitude');
  ok(!(env.extLoads || []).includes('ext6.js'), 'XC engine not loaded before the start');
  env.start();
  ok(env.extLoads.includes('ext6.js') && env.extLoads.includes('ext7.js') && env.extLoads.includes('ext8.js'), 'engine compiled at the start');
  let h = 1500;
  const step = (fix, r, inp) => { lkTick(env, h, h + r, r * 100); h += r; return env.tick(Object.assign({ la: fix && fix[0], lo: fix && fix[1], walt: h }, inp)); };
  for (let i = 0; i < 20; i++) step(null, 0.2, { spd: 1 }); // long enough for the 12-tick take-off ring
  eq(XC(env)[0], 2, 'GLIDE on the ground');
  eq(shown(['la', 'lg', 'cv', 'cw', 'cl', 'ac', 'ax', 'fl', 'rs', 'gp']), 'la,lg,cv,cw,cl,ax,fl', 'C2 and the left altitude instead of the centred one; GAIN/LAST top right (2026-10-05); flight time at the bottom');
  eq(env.scr.text('la') + '|' + env.scr.text('cl'), 'GS km/h|\u00a0L/D');
  ok(env.scr.visible('lg') && env.scr.visible('gn') && /^(GAIN|LAST)$/.test(env.scr.text('lg')), 'GLIDE top right: climb session gain or LAST (owner 2026-10-05: the field was empty)');
  ok(!env.scr.visible('gp'), 'no engine text at the bottom without a wind');
  eq(env.output.ft, 0, 'ft stays the flight time');
  eq(env.output.gn, undefined, 'no take-off yet: TO --');
  const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 200, noise: 2, mode: 'lead', seed: 7 });
  let k = 0, to0 = NaN, amax = -1e9;
  const track = () => { if (env.state('air')) { if (to0 !== to0) to0 = env.output.alt - XC(env)[6]; amax = Math.max(amax, env.output.alt); } };
  for (; k < 10; k++) { step(tr.fix[k], -1, { spd: 9 }); track(); }
  eq(XC(env)[0], 2, 'GLIDE after take-off');
  eq(env.scr.text('la') + '|' + env.scr.text('cl'), 'GS km/h|\u00a0L/D');
  ok(env.scr.visible('lg') && env.scr.visible('gn') && /^(GAIN|LAST)$/.test(env.scr.text('lg')), 'GLIDE top right: climb session gain or LAST (owner 2026-10-05: the field was empty)');
  eq(env.scr.text('av'), '32.4', 'ground speed 9 m/s in km/h, one decimal');
  for (; k < 60; k++) { step(tr.fix[k], -1, { spd: 9 }); track(); }
  const ld = Math.round(XC(env)[5] * 10);
  eq(env.scr.text('cw'), ld < 100 ? (ld / 10).toFixed(1) : '' + Math.round(ld / 10), 'L/D over ground while sinking (one decimal below 10): ' + XC(env)[5].toFixed(2));
  near(XC(env)[5], 9.5 / 1, 3, 'about airspeed / sink');
  let enter = -1;
  for (; k < 150; k++) { step(tr.fix[k], 2, { spd: 9 }); track(); if (enter < 0 && XC(env)[0] === 3) enter = k; }
  ok(enter > 60 && enter <= 60 + 22, 'THERMAL within a circle: tick ' + enter);
  ok(env.scr.visible('mp') && env.scr.visible('ml') && !env.scr.visible('vn') && !env.scr.visible('la') && !env.scr.visible('ll'), 'THERMAL is the map page: trail and the small climb, no numbers (owner 2026-10-04)');
  ok(/^\+\d\.\d$/.test(env.scr.text('ml')), 'big instant climb: ' + env.scr.text('ml'));
  ok(/^\+\d+ m$/.test(env.scr.text('mg')), 'climb session gain under it: ' + env.scr.text('mg'));
  ok(env.output.tn % 16 > 7, 'tn carries the map-page bit');
  ok(!env.scr.visible('gp') && !env.scr.visible('fl') && XC(env)[13] === 1, 'map page: no bottom line (owner 2026-10-05), the wind is known');
  const st = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 60, noise: 2, mode: 'straight', seed: 9, heading: 90 });
  // straight on from where the circles ended, sinking: GLIDE after the 10-s exit grace (and at least 20 s on THERMAL)
  const off = [tr.fix[k - 1][0] - st.fix[0][0], tr.fix[k - 1][1] - st.fix[0][1]];
  let leave = -1;
  for (let j = 0; j < 60; j++) { step([st.fix[j][0] + off[0], st.fix[j][1] + off[1]], -1, { spd: 12 }); track(); if (leave < 0 && XC(env)[0] === 2) leave = j; }
  ok(leave >= 10 && leave <= 30, 'GLIDE ' + leave + ' s after the circling ended');
  for (let j = 0; j < 100; j++) step(null, 0, { spd: 0 });
  eq(env.state('air'), 0, 'landed');
  eq(XC(env)[0], 2, 'GLIDE after landing');
  // the take-off altitude came from the ring (12 ticks before the detection, the engine ran since the start): -1 m/s
  // for 60 ticks, +2 m/s for 90, then -1 again; without the take-off reset of the climb reference the total climb
  // would start from 0 m and read about 1,600 m
  const sum = env.summary(), t = sum.find((x) => x.id === 't').value, hm = sum.find((x) => x.id === 'h').value;
  ok(t > 174 && t <= 180.5, 'total climb ' + t + ' (1-s bins lag the climb ends by ~1 m each, then the 3 m hysteresis)');
  near(hm, amax - to0, 0.01, 'max above take-off: the highest altitude minus the take-off altitude ' + to0.toFixed(1));
  near(to0, 1502.5, 0.5, 'the take-off altitude is the one 12 ticks before the detection (5 ticks of speed, 7 of hiking)');
  eq(env.scr.lost.length, 0, 'no lost setText: ' + env.scr.lost.join());
});

test('X7 pages without a watch GPS fix: THERMAL follows the vario thermal state (and stays at least 20 s); setting pg 1 (classic, no engine) and an out-of-range pg 2 (classic)', () => {
  const env = xcEnv();
  for (let i = 0; i < 20; i++) env.fly(null, { r: -1 });
  eq(XC(env)[0], 2, 'GLIDE');
  let t = -1;
  for (let i = 0; i < 30; i++) { env.fly(null, { r: 2 }); if (t < 0 && XC(env)[0] === 3) t = i; }
  eq(env.state('th'), 1);
  ok(t >= 4 && t <= 8, 'THERMAL with the vario thermal state: tick ' + t);
  eq(env.scr.text('gp'), null, 'no wind without GPS');
  ok(!env.scr.visible('fl') && env.scr.visible('mg'), 'map page: no flight-time line, the climb gain instead');
  let g = -1;
  for (let i = 0; i < 60; i++) { env.fly(null, { r: -1 }); if (g < 0 && XC(env)[0] === 2) g = i; }
  ok(g >= 14, 'back to GLIDE when the thermal state ends: tick ' + g);
  const p1 = xcEnv({ settings: { pg: '1' } });
  p1.fly(null, { input: { spd: 0 } });
  ok(!p1.extLoads.includes('ext6.js') && XC(p1)[0] === 0, 'pg 1: the classic page, the engine is never loaded');
  const p2 = xcEnv({ settings: { pg: '2' } });
  const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 90, noise: 2, mode: 'circle', seed: 4 });
  tr.fix.forEach((f) => p2.fly(f, { r: 1 }));
  ok(!p2.extLoads.includes('ext6.js'), 'pg 2 (the pre-2026-10-04 classic index, now out of range): the default classic page');
  eq(XC(p2)[0], 0, 'classic page');
  ok(p2.output.ws === undefined && p2.output.wd === undefined, 'no wind');
  ok(!p2.scr.visible('cv') && p2.scr.visible('ac'), 'no C2 slot, centred altitude');
});

test('X8 slot values: ground speed from the watch, else the vario RMC (km/h, mph); L/D only while sinking; TC from 10 s in thermal; wind age and FIT outputs', () => {
  let env = xcEnv();
  for (let i = 0; i < 10; i++) env.fly(null, { r: -1 });
  eq(env.scr.text('av'), '32.4', 'watch speed 9 m/s');
  env.fly(null, { r: -1, input: { spd: undefined } });
  eq(env.scr.text('av'), '--', 'no watch speed, no RMC');
  env.feed(sentence('GPRMC,120000.00,A,4600.000,N,00800.000,E,20.0,245.0,031026,,,A,V'));
  env.fly(null, { r: -1, input: { spd: undefined } });
  eq(env.scr.text('av'), '37.0', 'the vario RMC: 20 kn');
  env.input.um = 1;
  env.fly(null, { r: -1, input: { spd: undefined } });
  eq(env.scr.text('la') + ' ' + env.scr.text('av'), 'GS mph 23.0', 'imperial');
  env.input.um = 0;
  for (let i = 0; i < 25; i++) env.fly(null, { r: 0.2, input: { spd: 9 } });
  eq(XC(env)[0], 2, 'weak climb, no thermal: GLIDE');
  eq(env.scr.text('cw'), '--', 'climbing: no glide ratio');
  // wind age: shown up to 30 minutes after the newest estimate, then -- (bottom line back to flight time), outputs undefined
  const r = windRun({ W: 5, from: 270, V: 9.5, T: 22, n: 90, noise: 2, mode: 'circle', wob: 1, seed: 11 });
  env = r.env;
  ok(env.output.ws > 4 && env.output.ws < 6);
  const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 1800, noise: 2, mode: 'straight', seed: 12, heading: 90 });
  const off = [r.tr.fix[89][0] - tr.fix[0][0], r.tr.fix[89][1] - tr.fix[0][1]];
  let gone = -1;
  for (let i = 0; i < 1800; i++) {
    env.fly([tr.fix[i][0] + off[0], tr.fix[i][1] + off[1]], { r: -0.5 });
    if (gone < 0 && env.output.ws === undefined) gone = i;
  }
  ok(gone > 1700 && gone <= 1800, 'wind dropped 30 min after the newest estimate: ' + gone);
  eq(env.output.wd, undefined);
  ok(env.scr.visible('fl') && !env.scr.visible('gp'), 'bottom line: flight time');
  eq(env.scr.lost.length, 0, 'no lost setText');
});

// ----- XC review round (2026-10-04): regression tests for the confirmed findings (each fails on the v1.1 review build) -----
test('X9 altitude source switches (algorithms P1-1, product P2-9): link dropouts with the watch altitude off the vario\'s (QNE, in-flight drift) change neither height above take-off nor max height nor total climb', () => {
  const run = (ar, off0, offAir) => {
    const env = xcEnv({ settings: { ar: String(ar) } });
    env.woff = off0;
    for (let i = 0; i < 40; i++) env.fly(null, { input: { spd: 0 } });
    const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 1200, noise: 2, mode: 'straight', seed: 5, heading: 90 });
    let k = 0, lo = 1e9, hi = -1e9;
    for (let i = 0; i < 20; i++) env.fly(tr.fix[k++], { r: -1 });
    env.woff = offAir; // the watch barometer drifts against the vario in flight (or reads QNE + 150 m)
    for (let c = 0; c < 6; c++) {
      for (let i = 0; i < 60; i++) env.fly(tr.fix[k++], { r: 1 });
      for (let i = 0; i < 8; i++) { env.fly(tr.fix[k++], { link: false }); lo = Math.min(lo, XC(env)[6]); hi = Math.max(hi, XC(env)[6]); }
      for (let i = 0; i < 40; i++) env.fly(tr.fix[k++], { r: -1 });
    }
    const s = env.summary(), g = (id) => s.find((x) => x.id === id).value;
    return { t: g('t'), h: g('h'), lo, hi };
  };
  const ref = run(0, 0, 0);
  near(ref.h, 140, 1.5, 'max above take-off with no offset');
  for (const [ar, a, b] of [[0, 0, 25], [0, 0, -25], [2, 150, 150], [2, -150, -150]]) {
    const r = run(ar, a, b);
    near(r.t, ref.t, 1, 'ar ' + ar + ', watch ' + b + ' m off: total climb (v1.1 review build: up to 1,248 m for 344)');
    near(r.h, ref.h, 1, 'ar ' + ar + ', watch ' + b + ' m off: max above take-off');
    ok(r.lo > 38 && r.hi < 142, 'ar ' + ar + ', watch ' + b + ' m off: height above take-off during the dropouts ' + r.lo.toFixed(0) + '..' + r.hi.toFixed(0) + ' m (true 40-140 m)');
  }
});

test('X10 a turn reversal in a thermal (algorithms P1-2): the circling direction follows it and the wind fit keeps estimating', () => {
  for (const rev of [20, 26, 60]) {
    for (let s = 0; s < 3; s++) {
      const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 360, noise: 2, mode: 'lead', wob: 1, rev: 60 + rev, seed: 900 + s * 13 });
      const env = xcEnv();
      let est = 0, last = 0, lastT = 0;
      tr.fix.forEach((f, i) => {
        env.fly(f, { r: i < 60 ? -1 : 1.5 });
        const x = XC(env);
        if (x[14] !== last && x[14] > 0) { last = x[14]; est++; lastT = i; }
      });
      ok(est >= 25 && lastT >= 330, 'reversal ' + rev + ' s into the circles, seed ' + s + ': ' + est + ' estimates in 5 min, the newest at ' + lastT + ' s (v1.1 review build: 0-2)');
    }
  }
});

test('X11 sparse watch fixes and GPS dropouts while circling in lift (algorithms P1-3): THERMAL stays, no page flapping', () => {
  const thermal = (fixAt) => {
    const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 360, noise: 2, mode: 'lead', wob: 1, seed: 17 });
    const env = xcEnv();
    let th = 0, flips = 0, prev = -1;
    tr.fix.forEach((f, i) => {
      env.fly(tr.fix[fixAt(i)], { r: i < 60 ? -1 : 2 });
      const p = XC(env)[0];
      if (i >= 60) { if (p === 3) th++; if (prev >= 0 && p !== prev) flips++; prev = p; }
    });
    return { th, flips };
  };
  for (const N of [5, 6, 10, 30]) { // power-saving GPS modes: the input repeats the last fix for N ticks
    const r = thermal((i) => Math.floor(i / N) * N);
    ok(r.th >= 280 && r.flips <= 1, 'a fix every ' + N + ' s: THERMAL on ' + r.th + ' of 300 ticks, ' + r.flips + ' page changes (v1.1 review build: 0 ticks at 5 s, 19-25 changes at 6-30 s)');
  }
  for (const G of [4, 6, 10]) { // one dropout of G s, 140 s into the thermal
    const r = thermal((i) => (i >= 200 && i < 200 + G ? 199 : i));
    ok(r.th >= 280 && r.flips <= 1, G + '-s dropout: THERMAL on ' + r.th + ' of 300 ticks, ' + r.flips + ' page changes (v1.1 review build: GLIDE for 21-23 s)');
  }
});

test('X12 heights and thermal time (algorithms P2-4..P2-7, product P2-6/P2-7): TC exact from its first value, max above take-off over all flights, a pause adds no climb, a take-off soon after a landing is the same flight', () => {
  // TC: a glide, then a constant +2.0 m/s climb (no GPS: THERMAL from the vario thermal state)
  let env = xcEnv();
  for (let i = 0; i < 40; i++) env.fly(null, { r: -1 });
  const tc = [];
  for (let i = 0; i < 90; i++) { env.fly(null, { r: 2 }); if (XC(env)[0] === 3 && XC(env)[10] > 9) tc.push('+' + (env.output.gn / XC(env)[10]).toFixed(1)); } // TC is not shown since 2026-10-04 (kept for the map page): gain / thermal time
  ok(tc.length > 60 && tc.every((t) => t === '+2.0'), 'TC +2.0 from its first value: ' + tc.slice(0, 6).join(' ') + ' (v1.1 review build: +2.7 +2.5 +2.3 ...)');
  // two flights in one exercise: the summary keeps flight 1's maximum height above its take-off
  env = xcEnv();
  for (let i = 0; i < 30; i++) env.fly(null, { input: { spd: 0 } });
  for (let i = 0; i < 20; i++) env.fly(null, { r: -1 });
  for (let i = 0; i < 200; i++) env.fly(null, { r: 2 });
  for (let i = 0; i < 500; i++) env.fly(null, { r: -1.5 });
  for (let i = 0; i < 100; i++) env.fly(null, { input: { spd: 0 } });
  eq(env.state('air'), 0, 'flight 1 landed');
  for (let i = 0; i < 600; i++) env.fly(null, { r: 0.3, input: { spd: 1 } }); // hike up 180 m
  for (let i = 0; i < 20; i++) env.fly(null, { r: -1 });
  for (let i = 0; i < 75; i++) env.fly(null, { r: 2 });
  for (let i = 0; i < 100; i++) env.fly(null, { r: -1 });
  const h = env.summary().find((x) => x.id === 'h').value;
  near(h, 380, 2, 'max above take-off after flight 2 is flight 1\'s (v1.1 review build: 131 m)');
  // a pause while climbing: the paused climb is not added on resume
  env = xcEnv();
  for (let i = 0; i < 30; i++) env.fly(null, { input: { spd: 0 } });
  for (let i = 0; i < 20; i++) env.fly(null, { r: -1 });
  for (let i = 0; i < 50; i++) env.fly(null, { r: 2 });
  const t0 = XC(env)[8];
  env.pause();
  for (let i = 0; i < 120; i++) env.fly(null, { r: 2 });
  env.cont();
  env.fly(null, { r: 0 });
  near(XC(env)[8], t0, 0.01, 'total climb on the first tick after the resume (v1.1 review build: +240 m at once)');
  // hovering: 70 s level at 1 m/s ground speed is detected as a landing; the take-off 8 s later keeps the references
  env = xcEnv();
  for (let i = 0; i < 30; i++) env.fly(null, { input: { spd: 0 } });
  for (let i = 0; i < 20; i++) env.fly(null, { r: -1 });
  const to = env.output.alt - XC(env)[6];
  for (let i = 0; i < 100; i++) env.fly(null, { r: 2 });
  for (let i = 0; i < 70; i++) env.fly(null, { input: { spd: 1 } });
  eq(env.state('air'), 0, 'the hover reads as a landing (main.js, unchanged since v1.0)');
  for (let i = 0; i < 30; i++) env.fly(null, { r: -0.5 });
  eq(env.state('air'), 1);
  near(env.output.alt - XC(env)[6], to, 0.5, 'same take-off altitude (v1.1 review build: the hover altitude)');
  near(XC(env)[7], 180, 1, 'max above take-off kept (v1.1 review build: reset to 0)');
  // the wind store: cleared at a take-off, not at one within 2 minutes of a landing (ext8.js driven directly)
  const vmod = require('vm');
  let clears = 0;
  const X = new Float32Array(16);
  const T = vmod.runInContext('(' + fs.readFileSync(path.join(H.APP, 'ext8.js'), 'utf8') + ')', vmod.createContext({ Math, Float32Array }))(X, 0, 0, (t, a, f) => { if (f < 0) clears++; return 0; });
  const air = (t) => (t >= 20 && t < 100) || (t >= 150 && t < 200) || t >= 400;
  for (let t = 1; t < 450; t++) T(t, 1500, 0, air(t) ? 1 : 0, 0, 1, 0, 9, NaN, 2);
  eq(clears, 2, 'wind store cleared at the take-offs at 20 and 400 s, not at the one 50 s after the landing at 100 s');
});

test('X13 wind line (product P1-3, P2-10; algorithms P2-8, P2-2): age from 5 min, CALM without a direction, kept through a missing altitude, no wind from white GPS noise on a straight line', () => {
  const r = windRun({ W: 5, from: 270, V: 9.5, T: 22, n: 90, noise: 2, mode: 'circle', wob: 1, seed: 11 });
  let env = r.env;
  ok(Math.abs(Math.hypot(XC(env)[11], XC(env)[12]) * 3.6 - 18) < 4, 'wind about 18 km/h after the circles');
  const st = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 600, noise: 2, mode: 'straight', seed: 12, heading: 90 });
  const off = [r.tr.fix[89][0] - st.fix[0][0], r.tr.fix[89][1] - st.fix[0][1]];
  const at = {};
  for (let i = 0; i < 400; i++) {
    // ticks 100-129: no vario and no watch altitude (the altitude is NaN)
    env.fly([st.fix[i][0] + off[0], st.fix[i][1] + off[1]], i >= 100 && i < 130 ? { link: false, input: { walt: NaN } } : { r: -0.5 });
    if (i >= 100 && i < 130 && XC(env)[13] !== 1) at.lost = i;
    at[i] = env.scr.text('gp');
  }
  ok(at.lost === undefined, 'the wind stays known without an altitude (v1.1 review build: gone at tick ' + at.lost + ')');
  ok(/^WIND 27\d° 1\d km\/h$/.test(at[200]) && /^WIND /.test(at[290]), 'under 5 minutes: WIND ' + at[200]);
  ok(/^[56]' 27\d° 1\d km\/h$/.test(at[330]), 'from 5 minutes the age replaces the label: ' + at[330]);
  ok(/^6' /.test(at[399]), at[399]);
  // calm: speed below 1.5 m/s, no direction (screen and logged output)
  env = windRun({ W: 0, from: 270, V: 9.5, T: 22, n: 90, noise: 2, mode: 'circle', wob: 1, seed: 11 }).env;
  ok(XC(env)[0] < 3 || !env.scr.visible('gp'), 'the map page shows no wind line');
  ok(env.output.ws < 1.5 && env.output.wd === undefined, 'logged: speed ' + env.output.ws.toFixed(2) + ' m/s, no direction');
  // straight climbing line, white GPS noise (3 m): circling may show, but no wind passes the gates (airspeed >= 7 m/s)
  let est = 0;
  for (let s = 0; s < 2; s++) {
    const tr = XT.track({ W: 5, from: 270, V: 9.5, T: 22, n: 1800, noise: 3, white: 1, mode: 'straight', seed: 77 + s * 31, heading: 69 });
    const e = xcEnv();
    let last = 0;
    tr.fix.forEach((f) => { e.fly(f, { r: 0.5 }); const x = XC(e); if (x[14] !== last && x[14] > 0) { last = x[14]; est++; } });
  }
  ok(est <= 4, est + ' false wind estimates in 1 h of straight flight with 3 m white noise (v1.1 review build: about 20)');
});

test('X14 XC texts (product P2-11): GLIDE on the ground shows the vario GPS line when chosen, C2 values fit in 4 characters', () => {
  const env = xcEnv({ settings: { gp: '1' } });
  const gps = () => { env.feed(sentence('GPRMC,120000.00,A,4600.000,N,00800.000,E,20.0,245.0,031026,,,A,V')); env.fly(null, { input: { spd: 0 } }); return env.scr.text('gp'); };
  gps();
  eq(XC(env)[0], 2, 'GLIDE on the ground');
  for (let i = 0; i < 3; i++) eq(gps(), 'GPS 245\u00b0 37 km/h', 'the vario GPS line while no wind is known');
  eq(env.scr.lost.length, 0, 'no lost setText');
  // C2 through ext9.js directly: THERMAL (page 3), 60 s of thermal time, gain n m -> TC = n / 60
  const vmod = require('vm');
  const out = {};
  const X = new Float32Array(16);
  const U = vmod.runInContext('(' + fs.readFileSync(path.join(H.APP, 'ext9.js'), 'utf8') + ')', vmod.createContext({ Math, setText: (id, t) => { out[id] = t; } }))(X);
  X[0] = 3; X[10] = 60;
  const c2 = (u, tc) => { U(1, 16384, u, tc * 60, NaN, 0, 0, 0); return out['#cw']; };
  for (const [u, tc, t] of [[1, 6, '1180'], [1, 3, '+590'], [1, 5.03, '+990'], [1, -1, '-200'], [1, -6, '-990'], [1, 0, '0'], [0, 2.34, '+2.3'], [0, -0.5, '-0.5'], [0, 12.3, '+12'], [0, -10.4, '-10'], [0, 0, '0.0']]) {
    eq(c2(u, tc), t, (u ? 'imperial' : 'metric') + ' TC ' + tc + ' m/s');
    ok(out['#cw'].length <= 4, out['#cw'] + ': at most 4 characters (v1.1 review build: +1180 clipped on n)');
  }
});

test('X15 long press (owner 2026-10-06): UP/DOWN hold toggles THERMAL map <-> GLIDE against the automatic page; the next hold returns to automatic; no effect on the classic setting', () => {
  ok(/<pushButton name="up" longType="action" onLongPressStart="\$\.put\('\/Zapp\/\{zapp_index\}\/Event', 2/.test(H.HTML) && /<pushButton name="down" longType="action"/.test(H.HTML), 'template: UP and DOWN holds send event 2; short presses stay native');
  const env = xcEnv();
  for (let i = 0; i < 12; i++) env.fly(null, { r: -1 });
  eq(XC(env)[0], 2, 'GLIDE automatically');
  env.event(2); env.fly(null, { r: -1 });
  eq(XC(env)[0], 3, 'hold: the map page, though the glide would say GLIDE');
  ok(env.scr.visible('mp') && !env.scr.visible('vn'), 'map shown');
  for (let i = 0; i < 30; i++) env.fly(null, { r: -1 });
  eq(XC(env)[0], 3, 'pinned until the next hold');
  env.event(2); env.fly(null, { r: -1 });
  eq(XC(env)[0], 2, 'next hold: automatic again (GLIDE)');
  const c = xcEnv({ settings: { pg: '1' } });
  c.event(2); c.fly(null, { r: -1 });
  eq(XC(c)[0], 0, 'classic setting: the hold does nothing (no XC engine)');
});

test('P12 evalFile only in main.js (platform P1-1, reference L1212): no ext file calls it, the XC engine gets ext7-9.js as factories compiled in onExerciseStart', () => {
  for (const f of fs.readdirSync(H.APP).filter((x) => /^ext\d\.js$/.test(x))) {
    const code = fs.readFileSync(path.join(H.APP, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    ok(!/evalFile/.test(code), f + ' calls evalFile');
  }
  const src = fs.readFileSync(path.join(H.APP, 'main.js'), 'utf8');
  const start = /function onExerciseStart\(\) \{([\s\S]*?)\n\}/.exec(src)[1];
  for (const f of ['ext6', 'ext7', 'ext8', 'ext9']) ok(start.indexOf("evalFile('{file_path}/" + f + ".js')") >= 0, f + ' compiled in onExerciseStart');
  // the harness gives ext files no evalFile (an ext file that calls it throws in every XC test); the engine works
  const env = xcEnv();
  env.fly(null, { r: -1 });
  ok(env.extLoads.join() === 'ext5.js,ext1.js,ext2.js,ext2.js,ext6.js,ext9.js,ext7.js,ext8.js', 'load order ' + env.extLoads.join());
  eq(XC(env)[0], 2, 'the engine runs');
});

// ======================= Shipped (minified) code =======================
const scripted = async (minified, simLoad) => {
  const o = minified ? { minified: await H.minifiedMain(), simLoad, settings: { gp: '1', pg: '0' } } : { settings: { gp: '1', pg: '0' } };
  const env = makeEnv(o);
  const trace = [];
  const outs = () => { const o = {}; for (const k of H.OUT_NAMES) if (k in env.output) o[k] = env.output[k]; return o; }; // key order differs
  const rec = () => trace.push(JSON.stringify(outs(), (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)) + '|' + env.scr.shown().join(',') + '|' + ['nm', 'ni', 'av', 'bt', 's0', 'lg', 'la', 'rs', 'll', 'gp', 'cw', 'cl'].map((id) => env.scr.text(id)).join(','));
  env.load(); env.ui(); env.tick(); rec();
  env.ble(0, 111); env.ble(0, 100); env.tick(); rec(); env.tick(); rec();
  env.ble(1, 107); env.ble(2, 107); env.tick(); rec();
  env.ble(1, 109); env.tick(); rec();
  env.start();
  let h = 1500;
  // watch GPS fixes from tick 20: straight, then circling in a 5 m/s wind from 270 while the vario climbs (XC engine,
  // ext6-9.js, in its minified form: wind, THERMAL page, C2 and the WIND line)
  const tr = require('./xctrack').track({ W: 5, from: 270, V: 9.5, T: 22, n: 200, noise: 2, mode: 'lead', wob: 1, seed: 21 });
  for (let i = 0; i < 200; i++) {
    const r = i < 30 ? -1 : (i < 120 ? 2.2 : -1.4);
    lkTick(env, h, h + r, r * 100); h += r;
    if (i % 2) env.feed(sentence('GPRMC,120000.00,A,4600.000,N,00800.000,E,18.9,' + (i * 3) + '.0,031026,,,A,V'));
    const f = i >= 20 && i < 170 ? tr.fix[i - 20] : [undefined, undefined];
    env.tick({ spd: i < 20 ? 0 : 9, walt: 1700 + i * 0.5, la: f[0], lo: f[1] });
    rec();
  }
  env.ble(0, 101);
  for (let i = 0; i < 6; i++) { env.tick({ wvs: -1.1 }); rec(); }
  env.ble(0, 100); env.tick(); env.ble(1, 109); env.tick();
  for (let i = 0; i < 5; i++) { lkTick(env, h, h - 1, -100); h -= 1; env.tick({ um: i > 2 ? 1 : 0 }); rec(); }
  for (const c of H.capture().slice(0, 100)) env.ble(1, 106, c.bytes);
  env.tick(); rec();
  env.pause(); env.tick(); rec(); env.cont();
  env.scr = new H.Screen(); env.event(1); env.tick(); rec(); // view rebuilt, onActivate -> onEvent
  trace.push(JSON.stringify(env.summary()));
  return { trace, calls: env.calls.map((c) => c.name + JSON.stringify(c.args.filter((a) => typeof a !== 'function').map((a) => (a && a.length ? Array.from(a) : a)))), lost: env.scr.lost };
};

test('M1 the editor-minified main.js + ext files behave exactly like the source (outputs, screen, BLE calls, summary), loaded as sp-mem and as the simulator does', async () => {
  const a = await scripted(false);
  for (const simLoad of [false, true]) {
    const b = await scripted(true, simLoad); // the harness also checks that the dispatcher holds the only `return function`
    eq(b.trace.length, a.trace.length);
    for (let i = 0; i < a.trace.length; i++) eq(b.trace[i], a.trace[i], (simLoad ? 'simulator load, ' : '') + 'step ' + i);
  ok(a.trace.some((t) => t.indexOf(',WIND 2') >= 0), 'the session reaches the THERMAL page with a wind');
    eq(JSON.stringify(b.calls), JSON.stringify(a.calls), 'appConn calls');
    eq(b.lost.length, 0, 'no lost setText');
  }
});

// The differential golden trace (sessions.js, golden.json) was recorded from the v1.0 source before the memory round
// (SPEC §0.1.8): eight scripted sessions, 2,480 records of outputs and the whole screen model, and every appConn call.
// The debug and demo variants (variant.js) must behave like the store build on a watch too: only their logs differ.
test('D1 behaviour identical to v1.0: outputs, screen model, BLE calls and summary in 8 scripted sessions (store, debug and demo variants; source and minified)', async () => {
  const S = require('./sessions');
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8')).sessions;
  for (const [name, app] of [['store', H.APP], ['debug variant', H.variant('dbg')], ['demo variant', H.variant('demo')]]) {
    for (const minified of [false, true]) {
      const bad = S.compare(await S.traces(app, minified), g);
      ok(!bad.length, name + ', ' + (minified ? 'minified' : 'source') + ' form differs from v1.0:\n     ' + bad.join('\n     '));
    }
  }
});

test('V1 debug variant: every BLE event, every connect attempt, unknown sentence ids, the 10-tick line [vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm>', () => {
  const app = H.variant('dbg');
  const env = makeEnv({ app });
  env.load(); env.ui();
  let n = 0;
  env.ctx.appConn.connect = () => { n++; throw new Error('Duktape BLE API err 1'); };
  for (let i = 0; i < 100; i++) env.tick();
  ok(n > 3, n + ' connect attempts');
  eq(env.logs.filter((l) => l === '[vl] connect').length, n, 'every attempt logged');
  const d = connected({ app });
  for (const e of ['[vl] ev 111 ch 0', '[vl] ev 100 ch 0', '[vl] ev 107 ch 1', '[vl] ev 107 ch 2', '[vl] ev 109 ch 1']) ok(d.logs.includes(e), e);
  for (let i = 0; i < 15; i++) { lkTick(d, 1000, 1000, 50); d.tick(); }
  const line = d.logs.filter((l) => /^\[vl\] \d/.test(l)).pop();
  ok(/^\[vl\] 2 150 0 3\d\d 0 9 6 0 0 0 0 0 0$/.test(line), 'tick 20: LIVE, 150 lines, 0 bad, ~340-byte notifications, form 1, step 9, both 107s: ' + line);
  d.feed(sentence('PSTOD,1,FLY,') + sentence('PSTOD,2,FLY,'));
  for (let i = 0; i < 10; i++) d.tick();
  d.feed(sentence('GPGSA,A,3,'));
  for (let i = 0; i < 10; i++) d.tick();
  eq(JSON.stringify(d.logs.filter((l) => /^\[vl\] id /.test(l))), '["[vl] id 5053544f44","[vl] id 4750475341"]', 'an unknown sentence id is logged by the 10-tick line, once while it repeats (take-off announcement hunt)');
  const st = connected();
  for (let i = 0; i < 15; i++) { lkTick(st, 1000, 1000, 50); st.tick(); }
  eq(JSON.stringify(st.logs), '["[vl] connect"]', 'the store build logs only the first connect attempts');
});

test('V2 hardware-check variant neg (HARDWARE_TEST X8, product P1-2): the A2 height output reads -600 m on the XC pages only', () => {
  const app = H.variant('neg');
  const env = xcEnv({ app });
  env.fly(null, { input: { spd: 0 } });
  eq(XC(env)[0], 2, 'GLIDE on the ground');
  eq(env.output.gn, -600);
  for (let i = 0; i < 12; i++) env.fly(null, { r: -1 });
  eq(XC(env)[0], 2, 'GLIDE');
  eq(env.output.gn, -600);
  const c = connected({ app, settings: { pg: '2' } });
  c.start(); lkTick(c, 1000, 1000, 0); c.tick();
  ok(c.output.gn !== -600, 'the classic page shows its gain');
});

// Memory is measured in real Duktape 2.7 (the watch engine) with SUUNTOPO's sp-mem, replaying the recorded UltraBip
// stream (mem/scen-vario.js). The binding numbers are compiled sizes, not minified-source sizes: the watch allocates
// each compiled function as one block, and most logged watch allocation failures are 1.96-3.1 KB requests.
test('M2 memory (sp-mem, Duktape 2.7): every compiled function <= 1,900 B est32, module scope record 728 B (<= 56 names, never among the largest blocks), no growth, cyclic garbage only at setup; auto-page and classic-page resident and peaks reported', async () => {
  const esprima = require(path.join(H.LIB, '../../../esprima'));
  const m = (await H.minifiedMain()).replace(/^\/\/ \d+\n/, '');
  const total = Buffer.byteLength(m);
  const prog = esprima.parseScript('(function(){' + m + '\n})', { range: true });
  const outer = prog.body[0].expression.body.body;
  const sizes = [];
  let names = 0;
  for (const st of outer) {
    if (st.type === 'VariableDeclaration') {
      names += st.declarations.length;
      for (const d of st.declarations) { // helpers: function expressions and closures (immediately called functions)
        const fn = d.init && (d.init.type === 'FunctionExpression' ? d.init : (d.init.type === 'CallExpression' && d.init.callee.type === 'FunctionExpression' ? d.init.callee : null));
        if (fn) sizes.push([d.id.name, fn.range[1] - fn.range[0]]);
      }
    }
    if (st.type === 'ReturnStatement') sizes.push(['dispatcher', st.argument.range[1] - st.argument.range[0]]);
  }
  const ext = fs.readdirSync(H.APP).filter((f) => /^ext\d\.js$/.test(f)).sort().map((f) => [f, Buffer.byteLength(H.minifiedExt(f))]);
  console.log('     minified main.js ' + total + ' B (limits.md guideline 4,000 B: ' + (total <= 4000 ? 'met' : 'EXCEEDED by ' + (total - 4000) + ' B') + '); ' + names + ' module-level names');
  console.log('     minified functions: ' + sizes.map((x) => x[0] + ' ' + x[1]).join(', '));
  console.log('     ext: ' + ext.map((x) => x[0] + ' ' + x[1]).join(', '));
  eq(sizes.length, 7, 'onBle, ble, dat, fly, ui closures (ui also hands out ut), put and the dispatcher (terser inlined none of them)');
  ok(names <= 53, names + ' module-level names in the shipped form (the demo variant adds 3; a 57th name adds a 1 KB hash part to the scope record)');
  eq(H.moduleNames(await H.minifiedMain()), names);
  eq(H.scopeRecord(names), 728, 'module scope record from the measured step table (est32)');
  eq(H.scopeRecord(57), 1869, 'a 57th name: 65 entries and the hash part');
  eq(ext.length, 9, 'ext1-ext9');
  for (const [n, x] of ext) ok(x <= 1638, n + ' is ' + x + ' B');
  ok(total <= 6400, 'main.js within 6,400 B (thermal map and session gain 2026-10-04: 6,3xx B; v1.0: 6,041 B; memory round 5,270 B; v1.1 with the XC page hooks 5,928 B, 6,016 B since the XC review round compiles ext6-9.js in main.js; compiled size is the binding quantity, SPEC §0.1.9, §0.1.10)');
  const tool = ['../../../SUUNTOPLUS-AGENTIC-DEV-ENV/tools/sp-mem/sp-mem.js', '../../../SUUNTOPO/tools/sp-mem/sp-mem.js'].map((p) => path.join(__dirname, p)).find((p) => fs.existsSync(p)) || '';
  if (!fs.existsSync(tool)) { console.log('     sp-mem skipped: ' + tool + ' not found'); return; }
  const os = require('os');
  const { execFileSync } = require('child_process');
  // A synthetic full-rate flight recording for scen-xc.js (the same lines as mem/measure.js writes).
  const rec = path.join(os.tmpdir(), 'blevario-xcrec-' + process.pid + '.txt');
  let alt = 1500, txt = '';
  const rate = (t) => { t %= 128; return t < 60 ? 2.5 + 0.5 * Math.sin(t * 0.7) : (t < 100 || t >= 110 ? -1.2 : -3.1); };
  for (let t = 0; t < 128; t++) for (let i = 0; i < 10; i++) { const v = rate(t + i / 10); alt += v / 10; txt += lk8(Math.round(pressureAt(alt)), Math.round(alt), Math.round(v * 100), 1087) + sentence('LXWP0,N,,' + alt.toFixed(1) + ',' + v.toFixed(2) + ',,,,,,,,'); }
  fs.writeFileSync(rec, txt);
  const run = (scen, sets) => {
    const json = path.join(os.tmpdir(), 'blevario-spmem-' + process.pid + '.json');
    const args = [tool, H.APP, '--scenario', path.join(__dirname, 'mem', scen), '--variants', 'lowmem', '--forms', 'shipped', '--json', json];
    for (const x of sets) args.push('--set', x);
    const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
    const r = JSON.parse(fs.readFileSync(json, 'utf8')).results['lowmem/shipped'];
    fs.unlinkSync(json);
    const cp = (l) => r.checkpoints.find((c) => c.label === l);
    const base = cp('baseline'), st = cp('steady state');
    const scaled = (label) => { const mm = new RegExp(label + '[^\\n]*?([\\d,]+)\\s+([\\d,]+)\\s+([\\d,]+)\\s*\\n').exec(out); return mm ? +mm[2].replace(/,/g, '') : NaN; };
    const ratio = (st.walk.t32Total - base.walk.t32Total) / (st.live - base.live);
    const ticks = r.ticks.filter((t) => t[0] > 0), half = ticks[Math.floor(ticks.length / 2)], last = ticks[ticks.length - 1];
    return {
      r, st, steady: st.walk.t32Total - base.walk.t32Total, fit: st.walkAlt.t32Total - base.walkAlt.t32Total, load: scaled('load peak'), runPeak: scaled('run peak'),
      start: Math.round((cp('onExerciseStart').phasePeak - base.live) * ratio), end: Math.round((cp('exercise end').phasePeak - base.live) * ratio),
      growth: last[2] - half[2], garbage: ticks.filter((t) => t[7] > 0).map((t) => t[0] + ':' + t[7]), outs: out
    };
  };
  const res = { capture: run('scen-vario.js', ['pg=0']), xc: run('scen-xc.js', ['recfile=' + rec]), classic: run('scen-xc.js', ['recfile=' + rec, 'pg=2']) };
  fs.unlinkSync(rec);
  for (const [k, x] of Object.entries(res)) {
    console.log('     sp-mem est32 lowmem, ' + k + ': steady ' + x.steady + ' B (watch-fit ' + x.fit + '), load peak ' + x.load + ', exercise-start phase ' + x.start + ', run peak ' + x.runPeak + ' (a lower bound), exercise end ' + x.end +
      '; largest function ' + x.st.walk.maxAppFnBlockT32 + ' B; top: ' + x.st.walk.appTopBlocks.map((b) => b[0] + ' ' + b[2]).join(', '));
    eq(x.r.errorsTotal, 0, k + ': no app errors in Duktape');
    ok(x.st.walk.maxAppFnBlockT32 > 0 && x.st.walk.maxAppFnBlockT32 <= 1900, k + ': every compiled function within the ~1.9 KB guideline: ' + x.st.walk.maxAppFnBlockT32 + ' B');
    // sp-mem reports the 8 largest blocks (here all functions of 1.5 KB or more): a scope record among them would be
    // at least 1.5 KB, which only happens with its hash part (65 entries or more); the 728 B record is derived above
    // (platform review P2-6: this check used to read 0 from the top-8 list and pass without checking anything)
    ok(!x.st.walk.appTopBlocks.some((b) => b[2] === 'scopes'), k + ': no scope record among the largest blocks (smallest listed: ' + x.st.walk.appTopBlocks[x.st.walk.appTopBlocks.length - 1][0] + ' B)');
    ok(x.st.walk.appTopBlocks.length === 8 && x.st.walk.appTopBlocks[7][0] > 1100, k + ': the top-8 list reaches below a record with a hash part');
    eq(x.growth, 0, k + ': no live growth over the second half');
    ok(x.garbage.every((g) => +g.split(':')[0] <= 3 || (+g.split(':')[0] >= 104 && +g.split(':')[0] <= 106)), k + ': cyclic garbage only on the setup ticks (ext2.js registrations, again after the reconnect at tick 104): ' + x.garbage.join(' '));
  }
  ok(/ws=5\.\d+ wd=4\.7\d+/.test(res.xc.outs), 'the XC scenario estimates its 5 m/s wind from 270 deg (the fit ran): ' + (/ws=\S+ wd=\S+/.exec(res.xc.outs) || [''])[0]);
  // Regression caps at the measured values (SPEC §0.1.9). Neither meets the binding BLE display budget (steady
  // <= 10 KB, peak <= 12 KB): the memory round's floor without features was 19.1 KB steady.
  ok(res.xc.steady <= 47600 && res.capture.steady <= 47600, 'automatic pages (setting): steady ' + res.xc.steady + ' / ' + res.capture.steady + ' B within the recorded 45.8 KB with round fading dots and the sized core ring (44.3 KB square dots, 41.2 KB line map, 33.3 KB before the map; v1.1 review build 31.8 KB, SPEC §0.1.10)');
  ok(res.classic.steady <= 31200, 'classic page (the default, no XC engine): steady ' + res.classic.steady + ' B within the recorded 31.1 KB (the map template code is compiled on every page; 21.6 KB before it, memory round 19.1 KB)');
});

test('M3 ids used by main.js exist in v.html; template tokens exist in en.json; outputs match the manifest', () => {
  const src = fs.readFileSync(path.join(H.APP, 'main.js'), 'utf8');
  const sls = /sl: '([^']+)'\.split/.exec(fs.readFileSync(path.join(H.APP, 'ext5.js'), 'utf8'))[1].split('|');
  eq(sls.length, 42);
  for (const s of sls) ok(H.TEMPLATE[s.replace(/^#/, '').replace(/ \*$/, '')], 'selector ' + s);
  for (const m of src.matchAll(/'#([A-Za-z][A-Za-z0-9])'/g)) ok(H.TEMPLATE[m[1]], 'id ' + m[1]);
  const en = JSON.parse(fs.readFileSync(path.join(H.APP, 'en.json'), 'utf8'));
  for (const m of H.HTML.matchAll(/\{\{(\w+)\}\}/g)) ok(en[m[1]], 'en.json key ' + m[1]);
  for (const m of H.HTML.matchAll(/Output\/(\w+)"/g)) ok(H.OUT_NAMES.includes(m[1]), 'output ' + m[1]);
  eq(H.MANIFEST.out.filter((x) => x.log).length, 5, 'five logged outputs');
  ok(fs.statSync(path.join(H.APP, 'data.json')).size < 2048, 'data.json under 2 KB');
});

(async () => {
  for (const t of queue) {
    try {
      await t.fn();
      passed++;
      console.log('ok   ' + t.name);
    } catch (e) {
      failed++;
      console.log('FAIL ' + t.name + '\n     ' + String((e && e.stack) || e).split('\n').slice(0, 4).join('\n     '));
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
