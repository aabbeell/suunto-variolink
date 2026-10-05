// ABOUTME: Test harness for ble_vario: loads the shipping main.js (source or editor-minified) and ext*.js into Node vm
// ABOUTME: with stubbed watch globals (appConn, localStorage, setText/setStyle/getStyle, evalFile) and a screen model.

'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const os = require('os');

// BLEVARIO_APP: run the suite against another copy of the app (for example an older build, to show that a
// regression test fails there).
const APP = process.env.BLEVARIO_APP ? path.resolve(process.env.BLEVARIO_APP) : path.join(__dirname, '../../src/ble_vario');
const EXT_DIR = path.join(os.homedir(), '.vscode/extensions/suunto.suuntoplus-editor-1.42.0');
const LIB = path.join(EXT_DIR, 'node_modules/@suunto-internal/suuntoplus-tools/lib');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
const DATA = JSON.parse(fs.readFileSync(path.join(APP, 'data.json'), 'utf8'));
const HTML = fs.readFileSync(path.join(APP, 'v.html'), 'utf8');
const IN_NAMES = MANIFEST.in.map((x) => x.name);
// Numeric state slots of main.js (ring[64..]), from its '// S NAME index ...' table: state('air') reads ring[AIR].
const SLOTS = {};
for (const line of fs.readFileSync(path.join(APP, 'main.js'), 'utf8').split('\n')) {
  if (!/^\/\/ S /.test(line)) continue;
  const p = line.slice(5).trim().split(/\s+/);
  for (let i = 0; i + 1 < p.length; i += 2) SLOTS[p[i]] = +p[i + 1];
}
const OUT_NAMES = MANIFEST.out.map((x) => x.name);

// ---------- NMEA helpers ----------
const xor = (body) => {
  let c = 0;
  for (const ch of body) c ^= ch.charCodeAt(0);
  return c;
};
const hex2 = (c) => c.toString(16).toUpperCase().padStart(2, '0');
const sentence = (body) => '$' + body + '*' + hex2(xor(body)) + '\r\n';
const bytes = (s) => Array.from(Buffer.from(s, 'latin1'));
const pressureAt = (h) => 101325 * Math.pow(1 - h / 44330.77, 5.255876);
const qne = (p) => 44330.77 * (1 - Math.pow(p / 101325, 0.190263));
const lk8 = (p, alt, cms, bat) => sentence('LK8EX1,' + p + ',' + alt + ',' + cms + ',20,' + (bat === undefined ? 1087 : bat) + ',');

// ---------- template model ----------
// Parses v.html into {id: {hidden, parent, seed}}; visibility follows browser semantics (an explicit value wins,
// otherwise inherited from the parent), which is also what the reference's '#id *' example relies on.
function parseTemplate() {
  const els = {};
  const stack = [];
  const re = /<(\/?)(div|span)\b([^>]*?)(\/?)>([^<]*)/g;
  let m;
  while ((m = re.exec(HTML))) {
    if (m[1]) {
      stack.pop();
      continue;
    }
    const attrs = m[3];
    const idm = /\bid="([^"]+)"/.exec(attrs);
    const id = idm ? idm[1] : null;
    let parent = null;
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i] && stack[i] !== 'suuntoplus') { parent = stack[i]; break; }
    if (id) els[id] = { hidden: /visibility:hidden/.test(attrs), parent, seed: m[5].trim() };
    if (!m[4]) stack.push(id);
  }
  return els;
}
const TEMPLATE = parseTemplate();

class Screen {
  constructor() {
    this.el = {};
    for (const id of Object.keys(TEMPLATE)) {
      const t = TEMPLATE[id];
      this.el[id] = { vis: t.hidden ? false : undefined, parent: t.parent, text: t.seed, color: undefined };
    }
    this.lost = [];
    this.textCalls = 0;
    this.styleCalls = 0;
  }
  visible(id) {
    const e = this.el[id];
    if (!e) return false;
    if (e.vis !== undefined) return e.vis;
    return e.parent ? this.visible(e.parent) : true;
  }
  ids(sel) {
    const m = /^#([A-Za-z0-9]+)( \*)?$/.exec(sel);
    if (!m) throw new Error('unexpected selector ' + JSON.stringify(sel));
    if (!this.el[m[1]]) throw new Error('selector for unknown id ' + sel);
    if (!m[2]) return [m[1]];
    const out = [];
    for (const id of Object.keys(this.el)) {
      for (let p = this.el[id].parent; p; p = this.el[p].parent) if (p === m[1]) { out.push(id); break; }
    }
    return out;
  }
  setStyle(sel, prop, val) {
    this.styleCalls++;
    const ids = this.ids(sel);
    if (prop === 'visibility') {
      if (val !== 'VISIBLE' && val !== 'HIDDEN') throw new Error('visibility value ' + val);
      for (const id of ids) this.el[id].vis = val === 'VISIBLE';
    } else if (prop === 'color') {
      if (typeof val !== 'string' || !val) throw new Error('colour value ' + val + ' for ' + sel);
      for (const id of ids) this.el[id].color = val;
    } else throw new Error('unexpected style property ' + prop);
  }
  setText(sel, text) {
    this.textCalls++;
    const ids = this.ids(sel);
    if (ids.length !== 1 || sel.indexOf('*') >= 0) throw new Error('setText selector ' + sel);
    if (typeof text !== 'string' || !text.trim()) throw new Error('setText needs non-space text: ' + JSON.stringify(text));
    if (!this.visible(ids[0])) this.lost.push(ids[0] + '=' + text);
    else this.el[ids[0]].text = text;
  }
  shown() { // the visible id set, for compact assertions
    return Object.keys(this.el).filter((id) => this.visible(id));
  }
  text(id) {
    return this.visible(id) ? this.el[id].text : null;
  }
}

// ---------- minified main.js (exactly what the editor ships) ----------
// dir: the app directory (default src/ble_vario; a debug or demo variant from variant.js otherwise).
const minifiedCache = {};
async function minifiedMain(dir) {
  dir = dir || APP;
  if (minifiedCache[dir]) return minifiedCache[dir];
  const minifier = require(path.join(LIB, 'javascript/minifier.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blevario-min-'));
  const out = path.join(tmp, 'main.js');
  const src = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
  await minifier.minifyData('q', { languageCode: 'en' }, src, out, path.join(dir, 'manifest.json'));
  minifiedCache[dir] = fs.readFileSync(out, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return minifiedCache[dir];
}
function minifiedExt(file, dir) {
  const m = require(path.join(LIB, 'project/minify.js'));
  return m.minifyExt('q', { languageCode: 'en' }, path.join(dir || APP, file));
}

// Module-level names of a minified main.js (the top-level `var` declarations of the function body the watch
// compiles), and the module scope record they need in lowmem Duktape, est32 (SPEC §0.1 B7, measured with sp-mem in
// review round 2 while the record was among the largest blocks): the property table grows in capacity steps
// (..., 41, 48, 56, 65, 75, 86, 98, 112, 128: each step adds (n + 16) / 8), 13 B per entry, plus a 1,024 B hash part
// from 64 entries. sp-mem lists only the 8 largest blocks (all functions of 1.5 KB or more here), so a record of
// 728 B is never among them and is derived from the name count instead.
function moduleNames(minified) {
  const esprima = require(path.join(LIB, '../../../esprima'));
  const prog = esprima.parseScript('(function(){' + minified.replace(/^\/\/ \d+\n/, '') + '\n})');
  return prog.body[0].expression.body.body.filter((st) => st.type === 'VariableDeclaration').reduce((n, st) => n + st.declarations.length, 0);
}
function scopeRecord(names) {
  let c = 48;
  while (c < names) c += Math.floor((c + 16) / 8);
  for (let d = c; d >= names; d = Math.ceil((8 * d - 16) / 9)) c = d; // down the same steps (41, 35, ...)
  return c * 13 + (c >= 64 ? 1024 : 0);
}

// ---------- environment ----------
// o.zapp: number (watch) or 'fn' (simulator); o.connectRet: what appConn.connect returns; o.settings: data.json
// overrides (null removes a key); o.minified: run the editor-minified main.js and ext files (the string from
// minifiedMain(o.app)), loaded as sp-mem does, or as the simulator does with o.simLoad; o.noStyle: getStyle returns
// nothing; o.light: light theme; o.app: the app directory (default src/ble_vario; variant.js builds the debug and
// demo variants).
function makeEnv(o) {
  o = Object.assign({ zapp: 7, connectRet: 3, settings: {}, minified: null, noStyle: false, light: false, app: APP }, o || {});
  const dir = o.app;
  const store = Object.assign({}, JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')), o.settings);
  const env = { calls: [], logs: [], scr: new Screen(), handler: null, t: 0, inHandler: false, handlerAppCalls: 0, perTick: {} };
  const rec = (name) => (...a) => {
    if (env.inHandler) env.handlerAppCalls++;
    env.calls.push({ name, args: a, t: env.t });
    env.perTick[env.t] = (env.perTick[env.t] || 0) + 1;
    if (name === 'connect') {
      env.handler = a[1];
      return o.connectRet;
    }
    return undefined;
  };
  const g = {
    Uint8Array, Float32Array, Int8Array, DataView, Math, isFinite, isNaN, NaN, Infinity, undefined, Number, String, Object, Array, JSON,
    localStorage: { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) && store[k] !== null && store[k] !== undefined ? String(store[k]) : null) },
    appConn: { connect: rec('connect'), regUuid: rec('regUuid'), enaCharNotf: rec('enaCharNotf'), readChar: rec('readChar'), writeChar: rec('writeChar') },
    enabledZappId: o.zapp === 'fn' ? function () {} : o.zapp,
    setText: (s, t) => env.scr.setText(s, t),
    setStyle: (s, p, v) => env.scr.setStyle(s, p, v),
    getStyle: (s, p) => {
      if (p !== 'color') throw new Error('getStyle property ' + p);
      if (o.noStyle) return undefined;
      // o.light: the light theme, where the theme's text colour (.cm-bgc) is black
      return o.light && s === 'css:.cm-bgc' ? '#c-black' : '#' + s.replace('css:.', '');
    },
    systemEvent: (...a) => env.logs.push(a.join('')),
    playIndication: () => {}
  };
  // ext files run in a context with only the system globals, as on the watch, where main.js names are mangled.
  const extCtx = vm.createContext(Object.assign({}, g));
  g.evalFile = (p) => {
    if (!/^\{file_path\}\/ext\d\.js$/.test(p)) throw new Error('evalFile path ' + p);
    const file = p.slice('{file_path}/'.length);
    const src = o.minified ? minifiedExt(file, dir) : fs.readFileSync(path.join(dir, file), 'utf8');
    env.extLoads = (env.extLoads || []).concat(file);
    return vm.runInContext('(\n' + src + '\n)', extCtx, { filename: file });
  };
  // No evalFile in the ext files' context: the reference allows it only in main.js (L1212), so main.js compiles every
  // ext file itself (the XC engine gets ext7-9.js as factories); an ext file that calls it fails here.
  const ctx = vm.createContext(Object.assign({}, g));
  env.ctx = ctx;
  env.input = { slp: 101325, walt: 500, wvs: 0, spd: 0, um: 0, la: undefined, lo: undefined }; // no watch GPS fix
  env.output = {};
  let call;
  if (o.minified) {
    // The firmware's loader is not documented. sp-mem compiles the minified file as a function body and calls it;
    // the simulator replaces the first `return function` with `function main` and runs it as a script (editor
    // lib/javascript/minified-script.js). Both work only if the dispatcher holds the file's only `return function`.
    const n = o.minified.split('return function').length - 1;
    if (n !== 1) throw new Error('the minified main.js has ' + n + ' "return function"; the simulator would turn the first into "function main"');
    const dispatch = o.simLoad
      ? (vm.runInContext(o.minified.replace('return function', 'function main'), ctx, { filename: 'main.min.js' }), ctx.main)
      : vm.runInContext('(function () {\n' + o.minified + '\n})()', ctx, { filename: 'main.min.js' });
    const io = new Array(IN_NAMES.length + OUT_NAMES.length);
    call = (id, ev) => {
      IN_NAMES.forEach((n, i) => { io[i] = env.input[n]; });
      const r = dispatch(id, io, ev);
      OUT_NAMES.forEach((n, i) => { env.output[n] = io[IN_NAMES.length + i]; });
      return r;
    };
    env.state = () => { throw new Error('internal state is mangled in the minified build'); };
  } else {
    // Test hook (source form only, nothing changes in the shipped file): state private to a helper's closure
    // (`var x = (function () { var a, b; ... x = function (...) {...}; return x; })();`) is read through an accessor
    // inserted before each closure's final `return x;`; direct eval there sees exactly that closure's variables.
    const peeks = [];
    ctx.__peek = (f) => peeks.push(f);
    const src = fs.readFileSync(path.join(dir, 'main.js'), 'utf8').replace(/^(  )(return \w+;\n\}\)\(\);)$/gm,
      "$1__peek(function (__n, __v) { return arguments.length > 1 ? eval(__n + ' = __v') : eval(__n); });\n$1$2");
    vm.runInContext(src, ctx, { filename: 'main.js' });
    const fns = { 1: 'evaluate', 2: 'onLoad', 128: 'onExerciseStart', 256: 'onExercisePause', 512: 'onExerciseContinue', 4096: 'getUserInterface', 8192: 'getSummaryOutputs', 16384: 'onEvent' };
    call = (id, ev) => ctx[fns[id]](env.input, env.output, ev);
    const slot = (name) => SLOTS[name.toUpperCase()];
    // A module-level name (a property of the context), else the one closure that has it (an error if none or several).
    const closure = (name) => {
      const found = peeks.filter((f) => { try { f(name); return true; } catch (e) { if (e && e.name === 'ReferenceError') return false; throw e; } });
      if (found.length !== 1) throw new Error('state ' + name + ': in ' + found.length + ' closures');
      return found[0];
    };
    env.state = (name) => (slot(name) !== undefined ? ctx.ring[slot(name)] : (name in ctx ? ctx[name] : closure(name)(name)));
    env.setState = (name, v) => { if (slot(name) !== undefined) ctx.ring[slot(name)] = v; else if (name in ctx) ctx[name] = v; else closure(name)(name, v); };
  }
  env.load = () => call(2);
  env.tick = (inp) => {
    env.t++;
    if (inp) Object.assign(env.input, inp);
    call(1);
    return env.output;
  };
  env.start = () => call(128);
  env.pause = () => call(256);
  env.cont = () => call(512);
  env.ui = () => call(4096);
  env.summary = () => call(8192);
  env.event = (id) => call(16384, id); // the template's onActivate: $.put('/Zapp/{zapp_index}/Event', id)
  env.ble = (ch, ev, data) => {
    if (!env.handler) throw new Error('no BLE handler registered');
    env.inHandler = true;
    try {
      env.handler(ch, ev, data);
    } finally {
      env.inHandler = false;
    }
  };
  env.feed = (s) => env.ble(1, 106, bytes(s));
  env.callsNamed = (n) => env.calls.filter((c) => c.name === n);
  return env;
}

// The debug or demo variant of the current source (variant.js), built once per run into a temp directory.
const variantDirs = {};
function variant(flags) {
  if (!variantDirs[flags]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blevario-' + flags.replace(',', '-') + '-'));
    require('./variant').build(flags.split(','), dir);
    variantDirs[flags] = dir;
  }
  return variantDirs[flags];
}
process.on('exit', () => { for (const d of Object.values(variantDirs)) fs.rmSync(d, { recursive: true, force: true }); });

// Load, then walk the connection flow until con == 1 (watch mode): connect, 100, register both UUID forms (one
// per tick), both 107s, notifications on id 1, 109.
function connected(o) {
  const env = makeEnv(o);
  env.load();
  env.ui();
  env.tick(); // connect
  env.ble(0, 111);
  env.ble(0, 100);
  env.tick(); // regUuid id 1 (16-byte form)
  env.tick(); // regUuid id 2 (16-byte form)
  env.ble(1, 107);
  env.ble(2, 107);
  env.tick(); // enaCharNotf id 1
  env.ble(1, 109);
  env.tick(); // con = 1
  return env;
}

// The recorded UltraBip notifications (docs/research/ultrabip-capture): [{t, bytes}], one line per notification.
function capture() {
  const file = path.join(__dirname, '../../docs/research/ultrabip-capture/capture-2026-10-03.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).chunks.map((c) => ({ t: c.t, bytes: Array.from(Buffer.from(c.hex, 'hex')) }));
}

// One tick of n LK8EX1 lines for a QNE altitude path h0 -> h1 (m) and vario cm/s.
function lkTick(env, h0, h1, cms, n, bat) {
  n = n || 10;
  let s = '';
  for (let i = 1; i <= n; i++) {
    const h = h0 + ((h1 - h0) * i) / n;
    s += lk8(Math.round(pressureAt(h)), Math.round(h), Math.round(cms), bat);
  }
  if (s) env.feed(s);
}

module.exports = { APP, LIB, MANIFEST, DATA, HTML, TEMPLATE, SLOTS, IN_NAMES, OUT_NAMES, xor, hex2, sentence, bytes, pressureAt, qne, lk8, makeEnv, connected, lkTick, capture, minifiedMain, minifiedExt, moduleNames, scopeRecord, variant, Screen };
