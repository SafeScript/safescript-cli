/**
 * safescript-cli tests.
 * Tests commands programmatically by calling the exported functions.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var commands = require('./lib/commands');

var pass = 0, fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; } else { fail++; console.log('FAIL: ' + msg); }
}

function eq(a, b, msg) {
  var as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as === bs) { pass++; } else { fail++; console.log('FAIL: ' + msg + '\n  expected: ' + bs + '\n  got:      ' + as); }
}

// Capture stdout
function captureStdout(fn) {
  var output = [];
  var orig = console.log;
  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    output.push(args.join(' '));
  };
  try { fn(); } finally { console.log = orig; }
  return output.join('\n');
}

// Async version: captures stdout during a Promise
async function captureStdoutAsync(fn) {
  var output = [];
  var orig = console.log;
  console.log = function() {
    var args = Array.prototype.slice.call(arguments);
    output.push(args.join(' '));
  };
  try { await fn(); } finally { console.log = orig; }
  return output.join('\n');
}

function captureStderr(fn) {
  var output = [];
  var orig = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    output.push(args.join(' '));
  };
  try { fn(); } finally { console.error = orig; }
  return output.join('\n');
}

async function captureStderrAsync(fn) {
  var output = [];
  var orig = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    output.push(args.join(' '));
  };
  try { await fn(); } finally { console.error = orig; }
  return output.join('\n');
}

// Set up test files
var testDir = path.join(__dirname, 'test-files');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

fs.writeFileSync(path.join(testDir, 'hello.safe'), [
  '/**',
  ' * @safescript 0.2',
  ' * @needs name',
  ' * @env node',
  ' */',
  'return "Hello, " + name + "!";'
].join('\n'));

fs.writeFileSync(path.join(testDir, 'math.safe'), [
  '/**',
  ' * @needs Math',
  ' */',
  'return Math.sqrt(144);'
].join('\n'));

fs.writeFileSync(path.join(testDir, 'bad.safe'),
  'return eval("1+1");'
);

fs.writeFileSync(path.join(testDir, 'pure.safe'),
  'return 2 + 2;'
);

(async function() {

// ── Run command (async — returns Promise) ─────────────────────

var out = await captureStdoutAsync(async function() {
  var code = await commands.run([path.join(testDir, 'pure.safe')]);
  eq(code, 0, 'run pure: exit 0');
});
assert(out.indexOf('4') >= 0, 'run pure: outputs 4');

out = await captureStdoutAsync(async function() {
  var code = await commands.run([path.join(testDir, 'hello.safe'), '--scope', 'name=World']);
  eq(code, 0, 'run with scope: exit 0');
});
assert(out.indexOf('Hello, World!') >= 0, 'run with scope: outputs greeting');

var err = await captureStderrAsync(async function() {
  var code = await commands.run([path.join(testDir, 'bad.safe')]);
  // bad.safe uses eval which is blocked — compile error returns 1 (sync)
  eq(code, 1, 'run bad: exit 1');
});
assert(err.length > 0, 'run bad: prints error');

// ── Validate command (sync) ───────────────────────────────────

out = captureStdout(function() {
  var code = commands.validate([path.join(testDir, 'pure.safe')]);
  eq(code, 0, 'validate pure: exit 0');
});
assert(out.indexOf('✓') >= 0, 'validate pure: checkmark');

out = captureStdout(function() {
  var code = commands.validate([path.join(testDir, 'bad.safe')]);
  eq(code, 1, 'validate bad: exit 1');
});
assert(out.indexOf('✗') >= 0, 'validate bad: cross mark');

out = captureStdout(function() {
  var code = commands.validate([testDir]);
  eq(code, 1, 'validate dir: exit 1 (has bad.safe)');
});
assert(out.indexOf('4 file(s)') >= 0, 'validate dir: found all files');

// ── Check command (sync) ──────────────────────────────────────

var manifest = path.join(testDir, 'manifest.json');
fs.writeFileSync(manifest, JSON.stringify({ name: 'string', Math: 'Math' }));

out = captureStdout(function() {
  var code = commands.check([testDir, '--manifest', manifest]);
  // bad.safe has syntax error, others should pass
  eq(code, 1, 'check with manifest: exit 1 (bad.safe fails syntax)');
});

fs.unlinkSync(manifest);

// ── Info command (sync) ───────────────────────────────────────

out = captureStdout(function() {
  var code = commands.info([path.join(testDir, 'hello.safe')]);
  eq(code, 0, 'info: exit 0');
});
assert(out.indexOf('0.2') >= 0, 'info: shows version');
assert(out.indexOf('name') >= 0, 'info: shows needs');
assert(out.indexOf('node') >= 0, 'info: shows env');

// ── Compile command (sync) ────────────────────────────────────

out = captureStdout(function() {
  var code = commands.compile([path.join(testDir, 'pure.safe')]);
  eq(code, 0, 'compile: exit 0');
});
assert(out.indexOf('return') >= 0, 'compile: outputs JS');

// ── Cleanup ────────────────────────────────────────────────────

fs.unlinkSync(path.join(testDir, 'hello.safe'));
fs.unlinkSync(path.join(testDir, 'math.safe'));
fs.unlinkSync(path.join(testDir, 'bad.safe'));
fs.unlinkSync(path.join(testDir, 'pure.safe'));
fs.rmdirSync(testDir);

// ── Summary ────────────────────────────────────────────────────

console.log('\nsafescript-cli tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

})();
