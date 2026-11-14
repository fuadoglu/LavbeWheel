import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { artifactDigest, publicVersions, validateManifest, validateManifestContent, verifyManifestSignature } from '../../scripts/admin-build-runner.mjs';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.ts';
import { createHash, generateKeyPairSync, sign as signManifestBytes } from 'node:crypto';
import { deployLocal } from '../../scripts/deploy-local-atomic.mjs';
import { runJob } from '../../scripts/admin-build-runner.mjs';

const signingPair = generateKeyPairSync('ed25519');
const publicKeyEncoded = signingPair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url');

const contentVersion = {
  id: '0123456789abcdef0123456789abcdef',
  revision: 3,
  payload: {
    kind: 'ui-catalog', locale: 'az', sourceHash: 'a'.repeat(64), expectedRevision: 2,
    records: [{ key: 'spin', message: 'Fırlat', sourceHash: 'b'.repeat(64), status: 'reviewed' }],
  },
};

function makeManifest() {
  const versions = [structuredClone(contentVersion)];
  const manifest = {
    manifestHash: createHash('sha256').update(canonicalJson(versions)).digest('hex'),
    buildId: 'build_12345678', createdAt: '2026-11-15T00:00:00Z', state: 'exporting', artifactHash: null, mode: 'publish', signatureAlgorithm: 'Ed25519',
    rollbackArtifactHash: null, versions,
  };
  manifest.signature = signManifestBytes(null, Buffer.from(canonicalJson(manifest)), signingPair.privateKey).toString('base64url');
  return manifest;
}

test('trusted runner verifies canonical publication digest and strict manifest records', () => {
  const valid = makeManifest();
  assert.equal(verifyManifestSignature(valid, publicKeyEncoded), true);
  assert.equal(validateManifest(valid), true);
  assert.equal(verifyManifestSignature({ ...valid, state: 'building' }, publicKeyEncoded), false);
  const mismatch = makeManifest();
  mismatch.manifestHash = '0'.repeat(64);
  assert.throws(() => validateManifest(mismatch), /MANIFEST_DIGEST_MISMATCH/);
  const invalidRecord = makeManifest();
  invalidRecord.versions[0].payload.records[0].message = '<script>unsafe</script>';
  invalidRecord.manifestHash = createHash('sha256').update(canonicalJson(invalidRecord.versions)).digest('hex');
  assert.equal(validateManifest(invalidRecord), true);
  assert.throws(() => validateManifestContent(invalidRecord), /MANIFEST_UNSAFE_TEXT/);
});

test('public content export removes server-only review metadata and import revision', () => {
  const [version] = publicVersions([contentVersion]);
  assert.equal('expectedRevision' in version!.payload, false);
  assert.equal('status' in version!.payload.records[0]!, false);
  assert.equal('sourceHash' in version!.payload.records[0]!, false);
  assert.equal(version!.payload.records[0]!.message, 'Fırlat');
});

test('artifact digest is stable across creation order and rejects symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lavbe-runner-test-'));
  try {
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    await mkdir(first); await mkdir(second);
    await writeFile(path.join(first, 'b.txt'), 'second');
    await writeFile(path.join(first, 'a.txt'), 'first');
    await writeFile(path.join(second, 'a.txt'), 'first');
    await writeFile(path.join(second, 'b.txt'), 'second');
    assert.equal(await artifactDigest(first), await artifactDigest(second));
    const linked = path.join(root, 'linked');
    await mkdir(linked);
    await symlink(path.join(first, 'a.txt'), path.join(linked, 'a.txt'));
    await assert.rejects(artifactDigest(linked), /BUILD_SYMLINK_NOT_ALLOWED/);
    assert.equal(await readFile(path.join(first, 'a.txt'), 'utf8'), 'first');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local deploy switches a static root atomically and preserves prior releases', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lavbe-local-deploy-'));
  try {
    const publishRoot = path.join(root, 'published');
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    await mkdir(first); await mkdir(second);
    await writeFile(path.join(first, 'index.html'), '<main>first</main>');
    await writeFile(path.join(second, 'index.html'), '<main>second</main>');
    const firstHash = await artifactDigest(first);
    const secondHash = await artifactDigest(second);
    await deployLocal({ artifactDirectory: first, artifactHash: firstHash, jobId: 'job-first-1234', publishRoot });
    assert.equal(await readFile(path.join(publishRoot, 'current', 'index.html'), 'utf8'), '<main>first</main>');
    await deployLocal({ artifactDirectory: second, artifactHash: secondHash, jobId: 'job-second-1234', publishRoot });
    assert.equal(await readFile(path.join(publishRoot, 'current', 'index.html'), 'utf8'), '<main>second</main>');
    assert.equal(await readFile(path.join(publishRoot, 'releases', 'job-first-1234-' + firstHash.slice(0, 16), 'index.html'), 'utf8'), '<main>first</main>');
    assert.equal(await realpath(path.join(publishRoot, 'current')), await realpath(path.join(publishRoot, 'releases', `job-second-1234-${secondHash.slice(0, 16)}`)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('runner validates a signed manifest, builds, waits for approval, then deploys and acknowledges', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lavbe-runner-protocol-'));
  try {
    const english = JSON.parse(await readFile(new URL('../../content/locales/en.json', import.meta.url), 'utf8'));
    const source = english.messages.siteTitle;
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const version = {
      id: 'abcdef0123456789abcdef0123456789', revision: 1,
      payload: {
        kind: 'ui-catalog', locale: 'en', sourceHash: createHash('sha256').update(canonicalJson(english.messages)).digest('hex'), expectedRevision: 0,
        records: [{ key: 'siteTitle', message: source, sourceHash, status: 'reviewed' }],
      },
    };
    const unsigned = {
      manifestHash: createHash('sha256').update(canonicalJson([version])).digest('hex'),
      buildId: 'build-runner-1234', createdAt: '2026-11-15T00:00:00Z', state: 'exporting', artifactHash: null,
      mode: 'publish', rollbackArtifactHash: null, signatureAlgorithm: 'Ed25519', versions: [version],
    };
    const initial = { ...unsigned, signature: signManifestBytes(null, Buffer.from(canonicalJson(unsigned)), signingPair.privateKey).toString('base64url') };
    const approvedUnsigned = { ...unsigned, state: 'deploying', artifactHash: '0'.repeat(64) };
    const config = {
      origin: 'https://api.example.test', jobId: 'job-runner-1234', credential: 'r'.repeat(43), publicKey: publicKeyEncoded,
      artifactRoot: path.join(root, 'private-artifacts'), publicRoot: path.join(root, 'public', 'current'),
    };
    const states: Array<{ state: string; artifactHash: string | null; errorCode: string | null }> = [];
    let manifestFetches = 0;
    let builtArtifactHash = '';
    let deployedHash = '';
    await runJob(config, {
      request: async (_config, suffix) => {
        assert.equal(suffix, 'manifest');
        manifestFetches += 1;
        if (manifestFetches === 1) return initial;
        const approved = { ...approvedUnsigned, artifactHash: builtArtifactHash };
        return { ...approved, signature: signManifestBytes(null, Buffer.from(canonicalJson(approved)), signingPair.privateKey).toString('base64url') };
      },
      report: async (_config, state, artifactHash = null, errorCode = null) => { states.push({ state, artifactHash, errorCode }); },
      buildArtifact: async (runnerConfig) => {
        const directory = path.join(runnerConfig.artifactRoot, runnerConfig.jobId);
        const site = path.join(directory, 'site');
        await mkdir(site, { recursive: true });
        await writeFile(path.join(site, 'index.html'), '<main>reviewed build</main>');
        builtArtifactHash = await artifactDigest(site);
        await writeFile(path.join(directory, '.lavbe-artifact.json'), JSON.stringify({ artifactHash: builtArtifactHash, manifestHash: initial.manifestHash }));
        return { directory, artifactHash: builtArtifactHash };
      },
      deploy: async (_config, _directory, hash) => { deployedHash = hash; },
      sleep: async () => {},
    });
    assert.equal(manifestFetches, 2);
    assert.equal(deployedHash, builtArtifactHash);
    assert.deepEqual(states.map((item) => item.state), ['validating', 'building', 'awaiting-promotion', 'succeeded']);
    assert.equal(states.at(-1)?.artifactHash, builtArtifactHash);
  } finally { await rm(root, { recursive: true, force: true }); }
});
