import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspect, verifyPackage } from '../../scripts/package-release.mjs';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lavbe-release-package-'));
  await mkdir(path.join(directory, 'public'));
  await writeFile(path.join(directory, 'public/index.html'), '<!doctype html><title>Fixture</title>');
  return directory;
}

async function seal(directory) {
  const content = await inspect(directory);
  await writeFile(path.join(directory, 'release-manifest.json'), JSON.stringify({
    formatVersion: 1,
    kind: 'internal-release-candidate',
    files: content.files,
    treeSha256: content.treeSha256,
  }));
}

test('release package manifest verifies checksums and the complete file tree', async () => {
  const directory = await fixture();
  try {
    await seal(directory);
    assert.equal((await verifyPackage(directory)).files.length, 1);
    await writeFile(path.join(directory, 'public/index.html'), 'changed');
    await assert.rejects(verifyPackage(directory), /PACKAGE_FILE_INTEGRITY_MISMATCH/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('release package rejects secret files and recognizable secret values', async () => {
  const directory = await fixture();
  try {
    await writeFile(path.join(directory, '.env'), 'LAVBE_DATABASE_PASSWORD=not-a-real-password');
    await assert.rejects(inspect(directory), /PACKAGE_SECRET_FILE_DETECTED/);
    await rm(path.join(directory, '.env'));
    await writeFile(path.join(directory, 'public/private.pem'), '-----BEGIN PRIVATE KEY-----');
    await assert.rejects(inspect(directory), /PACKAGE_SECRET_PATTERN_DETECTED/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
