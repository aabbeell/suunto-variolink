#!/usr/bin/env node
// ABOUTME: Validates and builds ble_vario with the SuuntoPlus Editor library, like tools/sp-build.js but with a correct ext*.js check.
// ABOUTME: Usage: node build.js [appDir] [outDir]; prints the minified main.js size; exits non-zero on any error.

// Why this exists: tools/sp-build.js runs javascript.validateAndMinify on every ext*.js. That function is the
// main.js validator: it parses the file as a whole program (an anonymous `function (...) {}` is a syntax error
// there) and requires getUserInterface. It therefore fails on the unmodified official BLE template. The real
// build (project/minify.js minifyExt) and evalFile treat an ext file as ONE expression, so that is what is
// checked here, with the same ES5 ESLint configuration the editor applies to main.js.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const EXT = path.join(os.homedir(), '.vscode/extensions/suunto.suuntoplus-editor-1.42.0');
const TOOLS = path.join(EXT, 'node_modules/@suunto-internal/suuntoplus-tools/lib/index.js');
const LIB = path.dirname(TOOLS);

async function lintExt(file) {
  const { ESLint } = require(path.join(EXT, 'node_modules/eslint'));
  const esprima = require(path.join(EXT, 'node_modules/esprima'));
  const natives = require(path.join(LIB, 'javascript/function.js')).nativeFunctions;
  const vars = require(path.join(LIB, 'javascript/variable.js')).globalVariables;
  const src = fs.readFileSync(file, 'utf8');
  const errors = [];
  if (src.indexOf('{{') >= 0) errors.push('contains "{{" (Handlebars would rewrite it at build time)');
  const lines = src.split('\n');
  if (!/^\/\/ ABOUTME: /.test(lines[0]) || !/^\/\/ ABOUTME: /.test(lines[1])) errors.push('missing two-line ABOUTME header');
  let ast;
  try {
    ast = esprima.parseScript('(\n' + src + '\n)');
  } catch (e) {
    errors.push('not a single expression: ' + e.message);
  }
  if (ast && (ast.body.length !== 1 || ast.body[0].expression.type !== 'FunctionExpression')) errors.push('must be exactly one function expression');
  const globals = { Int8Array: 'readonly', Uint8Array: 'readonly', Float32Array: 'readonly', DataView: 'readonly' };
  for (const [k] of natives) globals[k] = 'readonly';
  for (const [k] of vars) globals[k] = 'readonly';
  const eslint = new ESLint({
    allowInlineConfig: false,
    useEslintrc: false,
    baseConfig: {
      parserOptions: { ecmaVersion: 5 },
      globals,
      rules: { 'no-undef': 'error', 'no-restricted-globals': ['error', { name: 'Date', message: 'Date object is not supported' }] }
    }
  });
  // Lint the wrapped text so the parser sees an expression statement; line numbers shift by one.
  for (const r of await eslint.lintText('(\n' + src + '\n);')) {
    for (const m of r.messages) errors.push('line ' + (m.line - 1) + ': ' + m.message);
  }
  return errors;
}

async function main() {
  const appDir = path.resolve(process.argv[2] || path.join(__dirname, '../../src/ble_vario'));
  const outDir = process.argv[3] ? path.resolve(process.argv[3]) : null;
  if (!fs.existsSync(TOOLS)) throw new Error('SuuntoPlus Editor 1.42.0 build library not found at ' + TOOLS);
  const T = require(TOOLS);

  await T.suuntoPlus.validateSourceDirectory(appDir);
  if (!(await T.validateProject(appDir))) throw new Error('Project validation failed (see messages above)');
  if (!(await T.javascript.validateAndMinify(path.join(appDir, 'main.js')))) throw new Error('main.js failed JavaScript validation');
  for (const f of fs.readdirSync(appDir).filter((n) => /^ext.*\.js$/.test(n)).sort()) {
    const errs = await lintExt(path.join(appDir, f));
    if (errs.length) throw new Error(f + ': ' + errs.join('; '));
    console.log(f + ': ext check OK (' + fs.statSync(path.join(appDir, f)).size + ' bytes source)');
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blevario-build-'));
  for (const f of fs.readdirSync(appDir)) {
    if (fs.statSync(path.join(appDir, f)).isFile()) fs.copyFileSync(path.join(appDir, f), path.join(work, f));
  }
  const appId = await T.suuntoPlus.getAppId(work);
  const result = await T.buildApp(appId, work, work, { languageCode: 'en' });
  if (!result.success) throw new Error('Build failed (see messages above)');
  const built = fs.readdirSync(work).filter((f) => /\.(fea|dev)$/i.test(f));
  if (!built.length) throw new Error('Build produced no .dev/.fea file');
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  console.log('BUILD OK appId=' + appId);
  for (const f of built) {
    const size = fs.statSync(path.join(work, f)).size;
    if (outDir) fs.copyFileSync(path.join(work, f), path.join(outDir, f));
    const listing = execFileSync('unzip', ['-l', path.join(work, f)], { encoding: 'utf8' });
    const entries = listing.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 4 && /^\d+$/.test(p[0]) && /\./.test(p[3]));
    console.log((outDir ? path.join(outDir, f) : path.join(work, f)) + ' ' + size + ' bytes; ' + entries.map((p) => p[3] + '=' + p[0]).join(' '));
    // Mounted template budget for a BLE display (docs/research/deep-dive/limits.md): 5 KB or less.
    for (const p of entries) if (/\.xml$/.test(p[3]) && +p[0] > 9000) throw new Error(f + ": " + p[3] + " is " + p[0] + " B (> 9000 B template cap; was 5000 B before the thermal map)");
  }
}

// The build library logs every minified script once per display; keep the output readable. It only warns about
// unknown localization tokens and CSS classes, which would ship as literal text or be ignored: treat them as errors.
const write = process.stdout.write.bind(process.stdout);
const problems = new Set();
const filter = (chunk) => {
  const lines = String(chunk).split('\n');
  for (const line of lines) if (/Unknown token|Unsupported CSS class|\[warn/i.test(line)) problems.add(line.trim());
  return lines.filter((line) => !/Minified code:|^var |^\(function|^\/\/ \d|Minifier: \d+ input/.test(line)).join('\n');
};
process.stdout.write = (chunk, ...rest) => {
  const kept = filter(chunk);
  return kept.trim() ? write(kept.endsWith('\n') ? kept : kept + '\n', ...rest) : true;
};
const writeErr = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...rest) => {
  filter(chunk);
  return writeErr(chunk, ...rest);
};

main().then(() => {
  if (problems.size) {
    console.error('BUILD FAILED: warnings treated as errors:\n  ' + Array.from(problems).join('\n  '));
    process.exit(1);
  }
}).catch((err) => {
  console.error('BUILD FAILED: ' + ((err && err.message) || err));
  process.exit(1);
});
