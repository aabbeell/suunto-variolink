#!/usr/bin/env node
// ABOUTME: Validates and builds a SuuntoPlus app from the command line with the SuuntoPlus Editor's own build library.
// ABOUTME: Usage: node sp-build.js <appDir> [outDir]; exits non-zero on validation or build failure.

const path = require('path');
const fs = require('fs');
const os = require('os');

const TOOLS = path.join(os.homedir(), '.vscode/extensions/suunto.suuntoplus-editor-1.42.0/node_modules/@suunto-internal/suuntoplus-tools/lib/index.js');

async function main() {
  const appDir = path.resolve(process.argv[2] || '.');
  const outDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
  if (!fs.existsSync(TOOLS)) throw new Error('SuuntoPlus Editor 1.42.0 build library not found at ' + TOOLS);
  const T = require(TOOLS);

  await T.suuntoPlus.validateSourceDirectory(appDir);
  if (!(await T.validateProject(appDir))) throw new Error('Project validation failed (see messages above)');
  // Same checks as the SuuntoPlus Editor's own build: main.js is validated here, ext*.js files are checked by buildApp.
  if (!(await T.javascript.validateAndMinify(path.join(appDir, 'main.js')))) throw new Error('main.js failed JavaScript validation (see messages above)');

  // Build from a copy so build outputs never land in the source folder.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-build-'));
  for (const f of fs.readdirSync(appDir)) {
    if (fs.statSync(path.join(appDir, f)).isFile()) fs.copyFileSync(path.join(appDir, f), path.join(work, f));
  }
  const appId = await T.suuntoPlus.getAppId(work);
  const result = await T.buildApp(appId, work, work, { languageCode: 'en' });
  if (!result.success) throw new Error('Build failed (see messages above)');

  const built = fs.readdirSync(work).filter((f) => /\.(fea|dev)$/i.test(f));
  const target = outDir || work;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const f of built) fs.copyFileSync(path.join(work, f), path.join(outDir, f));
  }
  console.log('BUILD OK appId=' + appId);
  for (const f of built) console.log(path.join(target, f) + ' ' + fs.statSync(path.join(work, f)).size + ' bytes');
}

// The build library logs every minified script once per display; keep the output readable.
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  const kept = String(chunk).split('\n').filter((line) => !/Minified code:|^var |^\(function|Minifier: \d+ input/.test(line)).join('\n');
  return kept.trim() ? write(kept.endsWith('\n') ? kept : kept + '\n', ...rest) : true;
};

main().catch((err) => {
  console.error('BUILD FAILED: ' + (err && err.message || err));
  process.exit(1);
});
