#!/usr/bin/env node
// ABOUTME: Builds the ble_vario debug, simulator-demo and hardware-check variants: a copy of src/ble_vario with the `//@dbg`,
// ABOUTME: `//@demo` and/or `//@neg` marker lines switched on. Usage: node variant.js <dbg|demo|neg|dbg,neg|...> <outDir> [sim] [dp=N] [key=value ...]

// The store build ships neither the demo feed nor the debug logging (SPEC §0.1.8, memory). Their code stays in the
// source as comment lines that start with `//@dbg ` or `//@demo ` (comments are free: the minifier drops them).
// This script copies the app and uncomments the requested markers in main.js and the ext files:
//   dbg   systemEvent logging for the hardware tests (§16c): every BLE event, every connect attempt, the 10-tick
//         line `[vl] <state> <ok> <bad> <maxlen> <phase> <step> <rg> <fm>`, and every onEvent
//   demo  the simulator-only demo flight (§10): ext4.js feeds synthetic lines when appConn.connect returns nothing
//         and enabledZappId is a function (never on a watch); the DEMO tag below dp 10
//   neg   hardware check only (HARDWARE_TEST.md X8): the A2 height output reads -600 m on the XC pages, to see whether
//         the watch's Altitude formatter shows heights below -500 m (the editor's formatter table stops there)
// key=value pairs are written into the copy's data.json (for example sn=Abel gp=1 for a hardware-test build). The
// simulator gives main.js an empty localStorage (§0.1 T8), so with the word `sim` they also become the defaults in
// the copy's ext5.js (for example `demo <dir> sim dp=10 gp=1` for the GPS screenshot); dp=N always goes to ext5.js.
// The store build has 50 module names (v1.1); dbg adds 4 and demo 3. dbg,demo together has 57, one past the 56
// before the scope record grows by a 1 KB hash part: it works, but measure memory on dbg or demo alone.
// Then build the copy with `node tools/sp-build.js <outDir> <buildDir>` or `node test/ble_vario/build.js <outDir> <buildDir>`.

'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/ble_vario');
const FLAGS = ['dbg', 'demo', 'neg', 'map'];

// Returns {text, count}: the text with the marker lines of `flags` switched on, and how many lines per flag.
function enable(text, flags) {
  const n = {};
  const out = text.split('\n').map((l) => {
    const m = /^(\s*)\/\/@(\w+) (.*)$/.exec(l);
    if (!m || !flags.includes(m[2])) return l;
    n[m[2]] = (n[m[2]] || 0) + 1;
    return m[1] + m[3];
  });
  return { text: out.join('\n'), count: n };
}

// Sets the default of every key in defs in ext5.js's `g('key', max, default)` reads (code lines only, not markers).
function defaults(text, defs) {
  for (const k of Object.keys(defs)) {
    if (!/^\d+$/.test(String(defs[k]))) throw new Error('the ext5.js default for ' + k + ' must be a whole number, not ' + JSON.stringify(defs[k]));
    const re = new RegExp("^(?!\\s*//)(.*g\\('" + k + "', \\d+, )\\d+(\\))", 'm');
    if (!re.test(text)) throw new Error('no ext5.js default for ' + k + (k === 'dp' ? ' (dp needs the demo flag)' : ''));
    text = text.replace(re, '$1' + (+defs[k]) + '$2');
  }
  return text;
}

// flags: array of 'dbg'/'demo'; outDir: created or emptied; o.dp: demo phase default; o.data: data.json overrides;
// o.sim: also write o.data's values as the ext5.js defaults.
function build(flags, outDir, o) {
  o = o || {};
  for (const f of flags) if (!FLAGS.includes(f)) throw new Error('unknown variant flag ' + f);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const total = {};
  for (const f of fs.readdirSync(SRC)) {
    const p = path.join(SRC, f);
    if (!fs.statSync(p).isFile() || /\.(fea|dev|zip)$/.test(f)) continue;
    let t = fs.readFileSync(p, 'utf8');
    if (/\.js$/.test(f)) {
      const r = enable(t, flags);
      t = r.text;
      for (const k of Object.keys(r.count)) total[k] = (total[k] || 0) + r.count[k];
      if (f === 'ext5.js') t = defaults(t, Object.assign({}, o.sim ? o.data : {}, o.dp !== undefined ? { dp: o.dp } : {}));
    }
    if (f === 'data.json' && o.data) t = '{ ' + Object.entries(Object.assign(JSON.parse(t), o.data)).map(([k, v]) => JSON.stringify(k) + ': ' + JSON.stringify(v)).join(', ') + ' }\n';
    fs.writeFileSync(path.join(outDir, f), t);
  }
  for (const f of flags) if (!total[f]) throw new Error('no //@' + f + ' marker lines found');
  return total;
}

module.exports = { build, enable, FLAGS };

if (require.main === module) {
  const [flagArg, outDir, ...rest] = process.argv.slice(2);
  if (!flagArg || !outDir) { console.error('usage: node variant.js <dbg|demo|neg|dbg,neg|...> <outDir> [sim] [dp=N] [key=value ...]'); process.exit(2); }
  const o = { data: {} };
  for (const kv of rest) {
    if (kv === 'sim') { o.sim = true; continue; }
    const i = kv.indexOf('=');
    if (i < 0) { console.error('expected key=value: ' + kv); process.exit(2); }
    if (kv.slice(0, i) === 'dp') o.dp = kv.slice(i + 1);
    else o.data[kv.slice(0, i)] = kv.slice(i + 1);
  }
  if (!Object.keys(o.data).length) delete o.data;
  const n = build(flagArg.split(','), path.resolve(outDir), o);
  console.log('wrote ' + path.resolve(outDir) + ': ' + Object.keys(n).map((k) => n[k] + ' //@' + k + ' lines on').join(', '));
}
