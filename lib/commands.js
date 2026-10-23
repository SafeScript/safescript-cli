/**
 * safescript-cli commands.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var SafeScript = require('safescript');

function readFile(filePath) {
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch(e) {
    console.error('Error reading ' + filePath + ': ' + e.message);
    return null;
  }
}

function findSafeFiles(dir) {
  var results = [];
  var resolved = path.resolve(dir);

  function walk(d) {
    var entries;
    try { entries = fs.readdirSync(d); } catch(e) { return; }
    for (var i = 0; i < entries.length; i++) {
      var full = path.join(d, entries[i]);
      var stat;
      try { stat = fs.statSync(full); } catch(e) { continue; }
      if (stat.isDirectory()) {
        if (entries[i] !== 'node_modules' && entries[i][0] !== '.') {
          walk(full);
        }
      } else if (entries[i].endsWith('.safe')) {
        results.push(full);
      }
    }
  }

  walk(resolved);
  return results;
}

exports.help = function() {
  console.log([
    'Usage: safescript <command> [options]',
    '',
    'Commands:',
    '  run <file.safe> [--scope key=value ...]   Run a .safe file',
    '  validate <file.safe|dir>                  Validate .safe files',
    '  check <dir> [--manifest caps.json]        Check all .safe files against a capability manifest',
    '  compile <file.safe>                       Print compiled JavaScript',
    '  info <file.safe>                          Show header info (needs, uses, env)',
    '',
    'Options:',
    '  -h, --help      Show this help',
    '  -v, --version   Show version',
  ].join('\n'));
};

exports.version = function() {
  var pkg = require('../package.json');
  console.log('safescript-cli v' + pkg.version);
};

/**
 * Run a .safe file with optional scope.
 * --scope key=value pairs become string entries in the scope.
 * --json-scope file.json loads a JSON file as the scope.
 */
exports.run = function(args) {
  if (!args.length) {
    console.error('Usage: safescript run <file.safe> [--scope key=value ...] [--json-scope scope.json]');
    return 1;
  }

  var filePath = args[0];
  var source = readFile(filePath);
  if (!source) return 1;

  var scope = {};

  // Parse --scope and --json-scope
  for (var i = 1; i < args.length; i++) {
    if (args[i] === '--scope' && i + 1 < args.length) {
      i++;
      var pair = args[i].split('=');
      if (pair.length >= 2) {
        scope[pair[0]] = pair.slice(1).join('=');
      }
    } else if (args[i] === '--json-scope' && i + 1 < args.length) {
      i++;
      var jsonSource = readFile(args[i]);
      if (!jsonSource) return 1;
      try {
        var jsonScope = JSON.parse(jsonSource);
        var keys = Object.keys(jsonScope);
        for (var j = 0; j < keys.length; j++) {
          scope[keys[j]] = jsonScope[keys[j]];
        }
      } catch(e) {
        console.error('Invalid JSON scope: ' + e.message);
        return 1;
      }
    }
  }

  // Provide some safe built-ins
  scope.Math = scope.Math || Math;
  scope.JSON = scope.JSON || {
    parse: JSON.parse,
    stringify: JSON.stringify
  };
  scope.parseInt = scope.parseInt || parseInt;
  scope.parseFloat = scope.parseFloat || parseFloat;
  scope.isNaN = scope.isNaN || isNaN;
  scope.isFinite = scope.isFinite || isFinite;

  try {
    return SafeScript.run(source, scope).then(function(result) {
      if (result !== undefined) {
        if (typeof result === 'object') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result);
        }
      }
      return 0;
    }).catch(function(e) {
      console.error('Runtime error: ' + e.message);
      return 1;
    });
  } catch(e) {
    console.error('Compile error: ' + e.message);
    return 1;
  }
};

/**
 * Validate one or more .safe files.
 */
exports.validate = function(args) {
  if (!args.length) {
    console.error('Usage: safescript validate <file.safe|dir> [...]');
    return 1;
  }

  var files = [];
  for (var i = 0; i < args.length; i++) {
    var stat;
    try { stat = fs.statSync(args[i]); } catch(e) {
      console.error('Not found: ' + args[i]);
      return 1;
    }
    if (stat.isDirectory()) {
      files = files.concat(findSafeFiles(args[i]));
    } else {
      files.push(path.resolve(args[i]));
    }
  }

  if (!files.length) {
    console.log('No .safe files found.');
    return 0;
  }

  var errors = 0;
  for (var j = 0; j < files.length; j++) {
    var source = readFile(files[j]);
    if (!source) { errors++; continue; }

    var result = SafeScript.validate(source);
    var rel = path.relative(process.cwd(), files[j]);
    if (result.ok) {
      console.log('  ✓ ' + rel);
    } else {
      errors++;
      console.log('  ✗ ' + rel);
      for (var k = 0; k < result.errors.length; k++) {
        var err = result.errors[k];
        var loc = err.line ? ' (line ' + err.line + ')' : '';
        console.log('    ' + err.message + loc);
      }
    }
  }

  console.log('\n' + files.length + ' file(s), ' + (files.length - errors) + ' valid, ' + errors + ' invalid');
  return errors > 0 ? 1 : 0;
};

/**
 * Check all .safe files in a directory against a capability manifest.
 * The manifest is a JSON file mapping capability names to types:
 *   { "db": "Database", "auth": "AuthService", "math": "Math" }
 */
exports.check = function(args) {
  if (!args.length) {
    console.error('Usage: safescript check <dir> [--manifest caps.json]');
    return 1;
  }

  var dir = args[0];
  var manifest = null;

  for (var i = 1; i < args.length; i++) {
    if (args[i] === '--manifest' && i + 1 < args.length) {
      i++;
      var mSource = readFile(args[i]);
      if (!mSource) return 1;
      try {
        manifest = JSON.parse(mSource);
      } catch(e) {
        console.error('Invalid manifest JSON: ' + e.message);
        return 1;
      }
    }
  }

  var files = findSafeFiles(dir);
  if (!files.length) {
    console.log('No .safe files found in ' + dir);
    return 0;
  }

  var errors = 0;
  for (var j = 0; j < files.length; j++) {
    var source = readFile(files[j]);
    if (!source) { errors++; continue; }

    var rel = path.relative(process.cwd(), files[j]);

    // Validate syntax
    var valid = SafeScript.validate(source);
    if (!valid.ok) {
      errors++;
      console.log('  ✗ ' + rel + ' (syntax error)');
      continue;
    }

    // Check capabilities
    var caps = SafeScript.capabilities(source);

    if (manifest) {
      var missing = [];
      for (var k = 0; k < caps.needs.length; k++) {
        var name = caps.needs[k].name;
        if (manifest[name] === undefined) {
          missing.push(name);
        }
      }
      if (missing.length > 0) {
        errors++;
        console.log('  ✗ ' + rel + ' (missing: ' + missing.join(', ') + ')');
        continue;
      }
    }

    console.log('  ✓ ' + rel);
  }

  console.log('\n' + files.length + ' file(s), ' + (files.length - errors) + ' passed, ' + errors + ' failed');
  return errors > 0 ? 1 : 0;
};

/**
 * Compile and print the output JavaScript.
 */
exports.compile = function(args) {
  if (!args.length) {
    console.error('Usage: safescript compile <file.safe>');
    return 1;
  }

  var source = readFile(args[0]);
  if (!source) return 1;

  try {
    var result = SafeScript.compile(source);
    console.log(result.code);
    if (result.hash) {
      console.error('Hash: ' + result.hash);
    }
    return 0;
  } catch(e) {
    console.error('Compile error: ' + e.message);
    return 1;
  }
};

/**
 * Show header info for a .safe file.
 */
exports.info = function(args) {
  if (!args.length) {
    console.error('Usage: safescript info <file.safe>');
    return 1;
  }

  var source = readFile(args[0]);
  if (!source) return 1;

  var caps = SafeScript.capabilities(source);
  var rel = path.relative(process.cwd(), args[0]);

  console.log(rel + ':');
  console.log('  version: ' + (caps.version || '(none)'));
  console.log('  env:     ' + (caps.env ? caps.env.join(', ') : '(any)'));

  if (caps.needs.length) {
    console.log('  needs:');
    for (var i = 0; i < caps.needs.length; i++) {
      var n = caps.needs[i];
      console.log('    - ' + n.name + (n.type ? ': ' + n.type : ''));
    }
  } else {
    console.log('  needs:   (none)');
  }

  if (caps.uses.length) {
    console.log('  uses:');
    for (var j = 0; j < caps.uses.length; j++) {
      var u = caps.uses[j];
      console.log('    - ' + u.name + (u.type ? ': ' + u.type : ''));
    }
  } else {
    console.log('  uses:    (none)');
  }

  return 0;
};
