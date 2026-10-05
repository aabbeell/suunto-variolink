#!/usr/bin/env node
// ABOUTME: Records the differential golden trace (sessions.js) of an app directory into test/ble_vario/golden.json.
// ABOUTME: Usage: node golden.js [appDir] [--source-only]; re-record only after an intended, reviewed change of user-visible behaviour.

// The committed golden.json was recorded from the v1.0 source (commit ccd13c9, `git show ccd13c9:src/ble_vario/...`
// into a scratch directory) with --source-only: the harness maps the minified dispatcher's in/out array with the
// current manifest, which v1.0's manifest does not match. Re-recorded for v1.1 with the projection described in
// sessions.js, so D1 proves the classic page still behaves like the store v1.0 build.

'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./sessions');

(async () => {
  const args = process.argv.slice(2);
  const app = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '../../src/ble_vario'));
  const src = await S.traces(app, false);
  const d = S.digest(src);
  if (!args.includes('--source-only')) {
    const bad = S.compare(await S.traces(app, true), d);
    if (bad.length) { console.error('the minified form differs from the source form:\n' + bad.join('\n')); process.exit(1); }
  }
  const out = path.join(__dirname, 'golden.json');
  fs.writeFileSync(out, JSON.stringify({ app: args.includes('--source-only') ? 'v1.0 source (commit ccd13c9)' : path.relative(path.join(__dirname, '../..'), app), recorded: new Date().toISOString().slice(0, 10), sessions: d }) + '\n');
  const n = Object.values(d).reduce((s, x) => s + x.records.length, 0);
  console.log('wrote ' + out + ': ' + Object.keys(d).length + ' sessions, ' + n + ' records, ' + fs.statSync(out).size + ' B');
})();
