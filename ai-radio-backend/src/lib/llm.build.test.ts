import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// tsc does not copy plain .js files (allowJs is off), so the vendored client must be copied into dist by the build script.
// Without this the container starts, then crashes on `require('./llmUsage.js')`.
test('the build script copies the vendored llmUsage.js into dist', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /cp src\/lib\/llmUsage\.js dist\/lib\/llmUsage\.js/);
});
