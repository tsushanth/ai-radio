import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Digital Asset Links for https://audexa.app/live (Android App Link, autoVerify in the app manifest).
// The fingerprint is the Play APP SIGNING certificate (what installed builds are signed with), not the upload key.
const links = JSON.parse(readFileSync(new URL('../public/.well-known/assetlinks.json', import.meta.url), 'utf8'));

test('assetlinks.json lists the Audexa Android package with a well-formed SHA-256 fingerprint', () => {
  assert.ok(Array.isArray(links) && links.length === 1);
  const [entry] = links;
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(entry.target.namespace, 'android_app');
  assert.equal(entry.target.package_name, 'com.kreativekoala.audexa');
  const prints: string[] = entry.target.sha256_cert_fingerprints;
  assert.ok(prints.length >= 1);
  for (const p of prints) assert.match(p, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/, `bad fingerprint ${p}`);
});
