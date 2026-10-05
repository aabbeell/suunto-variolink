// ABOUTME: Scripted ble_vario sessions for the differential behaviour test (D1): every tick's outputs, the classic screen
// ABOUTME: model and every appConn call, hashed per record, so the classic page can be proven identical to v1.0.

// Sessions (from the 2026-10-04 memory profile's differential runner):
//   m1      a full flight: setup, take-off, thermal, glide, GPS fixes, junk lines, link drop and recovery, imperial
//           switch, the recorded capture, pause, a view activation, landing; run with five settings/theme variants
//   search  never found: 112 back-off, then a late 100 and 101
//   flaps   link flaps and UUID-form outcomes during setup, then data with gaps and a drop
//   throws  connect and enaCharNotf throwing before they work
// golden.js writes the digest of these sessions for a given app directory; run.js D1 compares against it.
// Since v1.1 (XC pages) a record is a projection: every session runs with the classic page setting (pg 2, ignored by
// v1.0), the outputs v1.0 and v1.1 share (v1.1 dropped bat, gs and hd, added ws and wd), the v1.0 elements except the
// bottom GPS line's content (v1.0: two evals, v1.1: one app-formatted text; only its visibility is compared) and the
// VARIO status line (v1.0 showed it with the vario battery; since 2026-10-04 it is hidden while live: not compared), and the
// summary entries sorted by id (v1.1 reordered them). golden.json is recorded from the v1.0 source (commit ccd13c9).

'use strict';
const crypto = require('crypto');
const H = require('./harness');
const { makeEnv, lkTick, sentence } = H;

const SESSIONS = {
  m1: (env) => {
    env.load(); env.ui(); env.tick(); env.rec();
    env.ble(0, 111); env.ble(0, 100); env.tick(); env.rec(); env.tick(); env.rec();
    env.ble(1, 107); env.ble(2, 107); env.tick(); env.rec();
    env.ble(1, 109); env.tick(); env.rec();
    env.start();
    let h = 1500;
    for (let i = 0; i < 200; i++) {
      const r = i < 30 ? -1 : (i < 120 ? 2.2 : -1.4);
      lkTick(env, h, h + r, r * 100); h += r;
      if (i % 2) env.feed(sentence('GPRMC,120000.00,A,4600.000,N,00800.000,E,18.9,' + (i * 3) + '.0,031026,,,A,V'));
      if (i === 150) env.feed('$GPRMC,1,V,,,,,,,*00\r\n$LK8EX1,999999,99999,9999,99,999,*00\r\n');
      env.tick({ spd: i < 20 ? 0 : 9, walt: 1700 + i * 0.5 });
      env.rec();
    }
    env.ble(0, 101);
    for (let i = 0; i < 40; i++) { env.tick({ wvs: -1.1 }); env.rec(); }
    env.ble(0, 100); env.tick(); env.ble(1, 109); env.tick();
    for (let i = 0; i < 5; i++) { lkTick(env, h, h - 1, -100); h -= 1; env.tick({ um: i > 2 ? 1 : 0 }); env.rec(); }
    for (const c of H.capture().slice(0, 100)) env.ble(1, 106, c.bytes);
    env.tick(); env.rec();
    env.pause(); env.tick(); env.rec(); env.cont();
    env.event(1); env.tick(); env.rec();
    for (let i = 0; i < 100; i++) { lkTick(env, h, h, 0); env.tick({ spd: 0 }); env.rec(); }
  },
  search: (env) => {
    env.load(); env.ui();
    for (let t = 0; t < 400; t++) {
      if (t % 23 === 5 && env.handler) env.ble(0, 112);
      if (t === 300) env.ble(0, 100);
      if (t === 310) env.ble(0, 101);
      env.tick(); env.rec();
    }
  },
  flaps: (env) => {
    env.load(); env.ui(); env.start(); env.tick(); env.rec();
    const seq = [[0, 100], 'T', [0, 101], 'T', [0, 100], 'T', [1, 107], 'T', [0, 101], [0, 100], 'T', [2, 108], 'T', 'T', [1, 107], 'T', 'T', 'T', 'T', 'T', 'T', [1, 110], 'T', [0, 112], 'T', [2, 109], 'T'];
    for (const s of seq) { if (s === 'T') { env.tick(); env.rec(); } else env.ble(s[0], s[1]); }
    for (let i = 0; i < 30; i++) { env.tick(); env.rec(); }
    let h = 800;
    for (let i = 0; i < 60; i++) {
      if (i % 7 !== 3) lkTick(env, h, h + 0.5, 50);
      h += 0.5;
      if (i === 40) env.ble(0, 101);
      if (i === 45) env.ble(0, 100);
      env.tick({ spd: 6 }); env.rec();
    }
  },
  throws: (env) => {
    const real = env.ctx.appConn.connect;
    let n = 0;
    env.ctx.appConn.connect = function () { if (n++ < 8) throw new Error('busy'); return real.apply(this, arguments); };
    const realEna = env.ctx.appConn.enaCharNotf;
    let m = 0;
    env.ctx.appConn.enaCharNotf = function () { if (m++ < 2) throw new Error('err 8'); return realEna.apply(this, arguments); };
    env.load(); env.ui();
    for (let t = 0; t < 200; t++) {
      if (env.handler && t === 150) env.ble(0, 100);
      if (env.handler && t === 151) { env.ble(1, 107); env.ble(2, 107); }
      env.tick(); env.rec();
    }
  }
};
const RUNS = [
  ['m1', { settings: { gp: '1' } }], ['m1', { settings: { gp: '0', um: 1 } }], ['m1', { light: true, settings: { sk: '1', aw: '3', ar: '1' } }],
  ['m1', { noStyle: true, settings: { sk: '0', aw: '1', ar: '2' } }], ['m1', { settings: { sk: '5', aw: '2' } }],
  ['search', {}], ['flaps', {}], ['throws', {}]
];
const OUTS = ['con', 'vs', 'av', 'alt', 'src', 'gn', 'ft'];
const IDS = ['suuntoplus', 's0', 's2', 'la', 'bt', 'lg', 'av', 'gn', 'h0', 'h1', 'vn', 'nm', 'vi', 'ni', 'll', 'fl', 'rs'];

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

// Runs every session on app directory `app` (source form, or the editor-minified form with minified = true).
// Returns {key: {records: [string], calls: [string], lost}}; digest() reduces records to hashes.
async function traces(app, minified) {
  const out = {};
  for (const [name, o] of RUNS) {
    const opts = Object.assign({}, o, { app: app || H.APP, settings: Object.assign({ pg: '2' }, o.settings) });
    if (minified) opts.minified = await H.minifiedMain(app);
    const env = makeEnv(opts);
    const records = [];
    const outs = () => { const r = {}; for (const k of OUTS) if (k in env.output) r[k] = env.output[k]; return r; };
    const screen = () => { const r = {}; for (const id of IDS) r[id] = env.scr.el[id]; r.gp = { vis: env.scr.el.gp.vis }; delete r.s0; r.ll = Object.assign({}, r.ll); delete r.ll.vis; return r; }; // ll's visibility is set since the map page (2026-10-04)
    env.rec = () => records.push(JSON.stringify(outs(), (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)) + '|' + JSON.stringify(screen()));
    SESSIONS[name](env);
    records.push(JSON.stringify(env.summary().slice().sort((a, b) => (a.id < b.id ? -1 : 1))));
    out[name + JSON.stringify(o)] = {
      records,
      calls: env.calls.map((c) => c.t + ':' + c.name + JSON.stringify(c.args.filter((a) => typeof a !== 'function').map((a) => (a && a.length ? Array.from(a) : a)))),
      lost: env.scr.lost.length
    };
  }
  return out;
}
const digest = (t) => {
  const d = {};
  for (const k of Object.keys(t)) d[k] = { records: t[k].records.map(hash), calls: t[k].calls, lost: t[k].lost };
  return d;
};
// Differences of trace t against digest g: one line per session that differs (first differing record or call).
const compare = (t, g) => {
  const bad = [];
  for (const k of Object.keys(g)) {
    const x = t[k];
    if (!x) { bad.push(k + ': missing'); continue; }
    const r = x.records.map(hash);
    let i = 0;
    while (i < Math.max(r.length, g[k].records.length) && r[i] === g[k].records[i]) i++;
    if (i < Math.max(r.length, g[k].records.length)) bad.push(k + ': record ' + i + ' of ' + g[k].records.length + ' differs: ' + String(x.records[i]).slice(0, 300));
    let j = 0;
    while (j < Math.max(x.calls.length, g[k].calls.length) && x.calls[j] === g[k].calls[j]) j++;
    if (j < Math.max(x.calls.length, g[k].calls.length)) bad.push(k + ': call ' + j + ' ' + x.calls[j] + ' (golden ' + g[k].calls[j] + ')');
    if (x.lost !== g[k].lost) bad.push(k + ': lost setText ' + x.lost + ' (golden ' + g[k].lost + ')');
  }
  return bad;
};

module.exports = { SESSIONS, RUNS, traces, digest, compare, hash };
