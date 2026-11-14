import { spawn } from 'node:child_process';
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile, cp, lstat, realpath, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import manifestSchema from '../contracts/publish-manifest.schema.json' with { type: 'json' };
import packSchema from '../contracts/admin-pack.schema.json' with { type: 'json' };
import uiSchema from '../contracts/admin-ui-catalog.schema.json' with { type: 'json' };
import seoSchema from '../contracts/admin-seo-copy.schema.json' with { type: 'json' };
import legalSchema from '../contracts/admin-legal.schema.json' with { type: 'json' };
import presetSchema from '../contracts/admin-preset.schema.json' with { type: 'json' };
import integrationSchema from '../contracts/admin-integration.schema.json' with { type: 'json' };
import englishCatalog from '../content/locales/en.json' with { type: 'json' };
import { canonicalJson } from '../packages/contracts/src/canonical-json.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateManifestSchema = ajv.compile(manifestSchema);
const schemaByKind = new Map([
  ['pack', ajv.compile(packSchema)], ['ui-catalog', ajv.compile(uiSchema)], ['seo-copy', ajv.compile(seoSchema)],
  ['legal', ajv.compile(legalSchema)], ['preset', ajv.compile(presetSchema)], ['integration', ajv.compile(integrationSchema)],
]);

export function publicVersions(versions) {
  return versions.map((version) => {
    const payload = structuredClone(version.payload);
    delete payload.expectedRevision;
    for (const record of payload.records ?? []) {
      if (payload.kind === 'ui-catalog') { delete record.status; delete record.sourceHash; }
      if (payload.kind === 'pack') delete record.review;
    }
    return { id: version.id, revision: version.revision, payload };
  });
}

export async function artifactDigest(directory) {
  const hash = createHash('sha256');
  const visit = async (current) => {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const relative = path.relative(directory, full).split(path.sep).join('/');
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error('BUILD_SYMLINK_NOT_ALLOWED');
      if (info.isDirectory()) { await visit(full); continue; }
      if (!info.isFile()) throw new Error('BUILD_SPECIAL_FILE_NOT_ALLOWED');
      const name = Buffer.from(relative, 'utf8');
      const data = await readFile(full);
      const lengths = Buffer.alloc(12);
      lengths.writeUInt32BE(name.length, 0);
      lengths.writeBigUInt64BE(BigInt(data.length), 4);
      hash.update(lengths).update(name).update(data);
    }
  };
  await visit(directory);
  return hash.digest('hex');
}

export function validateManifest(manifest) {
  if (!validateManifestSchema(manifest)) throw new Error('MANIFEST_SCHEMA_INVALID');
  if (canonicalJson(manifest.versions) !== canonicalJson([...manifest.versions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) throw new Error('MANIFEST_VERSIONS_UNSORTED');
  const actual = createHash('sha256').update(canonicalJson(manifest.versions), 'utf8').digest('hex');
  if (actual !== manifest.manifestHash) throw new Error('MANIFEST_DIGEST_MISMATCH');
  for (const version of manifest.versions) {
    const validateRecord = schemaByKind.get(version.payload.kind);
    if (!validateRecord || version.payload.records.some((record) => !validateRecord(record))) throw new Error('MANIFEST_RECORD_INVALID');
  }
  return true;
}

export function verifyManifestSignature(manifest, publicKeyEncoded) {
  if (!manifest || manifest.signatureAlgorithm !== 'Ed25519' || typeof manifest.signature !== 'string'
      || !/^[A-Za-z0-9_-]{86}$/.test(manifest.signature) || !/^[A-Za-z0-9_-]{43}$/.test(publicKeyEncoded)) return false;
  const publicKeyBytes = Buffer.from(publicKeyEncoded, 'base64url');
  const signatureBytes = Buffer.from(manifest.signature, 'base64url');
  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) return false;
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicKeyBytes]), format: 'der', type: 'spki' });
  const unsignedManifest = { ...manifest };
  delete unsignedManifest.signature;
  return verifySignature(null, Buffer.from(canonicalJson(unsignedManifest), 'utf8'), publicKey, signatureBytes);
}

export function validateManifestContent(manifest) {
  for (const version of manifest.versions) {
    const payload = version.payload;
    for (const record of payload.records) {
      const serialized = JSON.stringify(record);
      if (/<\/?[A-Za-z][^>]*>|javascript:/i.test(serialized)) throw new Error('MANIFEST_UNSAFE_TEXT');
    }
    if (payload.kind === 'ui-catalog') {
      if (createHash('sha256').update(canonicalJson(englishCatalog.messages), 'utf8').digest('hex') !== payload.sourceHash) throw new Error('MANIFEST_STALE_UI_SOURCE');
      for (const record of payload.records) {
        const source = englishCatalog.messages[record.key];
        if (typeof source !== 'string' || createHash('sha256').update(source, 'utf8').digest('hex') !== record.sourceHash) throw new Error('MANIFEST_STALE_UI_RECORD');
        const placeholders = (value) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
        if (JSON.stringify(placeholders(source)) !== JSON.stringify(placeholders(record.message))) throw new Error('MANIFEST_PLACEHOLDER_MISMATCH');
      }
    }
    if (payload.kind === 'pack') {
      for (const record of payload.records) {
        const source = structuredClone(record);
        delete source.review;
        if (createHash('sha256').update(canonicalJson(source), 'utf8').digest('hex') !== payload.sourceHash
            || record.review?.sourceHash !== payload.sourceHash || record.review?.status !== 'reviewed') throw new Error('MANIFEST_STALE_PACK_SOURCE');
      }
    }
  }
  return true;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`RUNNER_CONFIG_MISSING_${name}`);
  return value;
}

function validateConfig() {
  const origin = new URL(requiredEnv('LAVBE_RUNNER_API_ORIGIN'));
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('RUNNER_API_ORIGIN_INVALID');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('RUNNER_API_HTTPS_REQUIRED');
  const jobId = requiredEnv('LAVBE_RUNNER_JOB_ID');
  const credential = requiredEnv('LAVBE_RUNNER_CREDENTIAL');
  const publicKey = requiredEnv('LAVBE_RUNNER_MANIFEST_PUBLIC_KEY');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(jobId) || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error('RUNNER_CREDENTIAL_INVALID');
  if (!/^[A-Za-z0-9_-]{43}$/.test(publicKey)) throw new Error('RUNNER_MANIFEST_PUBLIC_KEY_INVALID');
  const artifactRootInput = requiredEnv('LAVBE_RUNNER_ARTIFACTS_DIR');
  if (!path.isAbsolute(artifactRootInput)) throw new Error('RUNNER_ARTIFACT_DIRECTORY_MUST_BE_ABSOLUTE');
  const artifactRoot = path.resolve(artifactRootInput);
  if (artifactRoot === root || artifactRoot.startsWith(`${root}${path.sep}`)) throw new Error('RUNNER_ARTIFACT_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY');
  const publicRootInput = requiredEnv('LAVBE_RUNNER_PUBLIC_ROOT');
  if (!path.isAbsolute(publicRootInput)) throw new Error('RUNNER_PUBLIC_ROOT_MUST_BE_ABSOLUTE');
  return { origin: origin.origin, jobId, credential, publicKey, artifactRoot, publicRoot: path.resolve(publicRootInput) };
}

function runnerUrl(config, suffix) {
  return `${config.origin}/api/admin/v1/runner/jobs/${encodeURIComponent(config.jobId)}/${suffix}`;
}

async function request(config, suffix, init = {}) {
  const response = await fetch(runnerUrl(config, suffix), {
    ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${config.credential}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) throw new Error(`RUNNER_API_${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function report(config, state, artifactHash = null, errorCode = null) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await request(config, 'status', { method: 'POST', body: JSON.stringify({ state, artifactHash, errorCode }) }); }
    catch (error) {
      lastError = error;
      const retryable = error instanceof TypeError || error?.name === 'TimeoutError' || /^RUNNER_API_5/.test(error?.message ?? '');
      if (!retryable || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw lastError;
}

function run(command, args, cwd = root, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(signal ? `COMMAND_SIGNAL_${signal}` : `COMMAND_EXIT_${code}`)));
  });
}

function buildEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LAVBE_')));
}

async function realPathWithMissingTail(target) {
  let cursor = path.resolve(target);
  const tail = [];
  while (true) {
    try { return path.join(await realpath(cursor), ...tail.reverse()); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      tail.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

async function findArtifact(config, expectedHash) {
  const candidates = await readdir(config.artifactRoot, { withFileTypes: true });
  for (const entry of candidates) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{8,64}$/.test(entry.name)) continue;
    const directory = path.join(config.artifactRoot, entry.name);
    try {
      const metadata = JSON.parse(await readFile(path.join(directory, '.lavbe-artifact.json'), 'utf8'));
      if (metadata.artifactHash === expectedHash && await artifactDigest(path.join(directory, 'site')) === expectedHash) return directory;
    } catch { /* An incomplete or corrupt local artifact is not a rollback target. */ }
  }
  throw new Error('KNOWN_GOOD_ARTIFACT_NOT_FOUND');
}

async function buildArtifact(config, manifest) {
  const directory = path.join(config.artifactRoot, config.jobId);
  try { await readFile(path.join(directory, '.lavbe-artifact.json')); throw new Error('JOB_ARTIFACT_ALREADY_EXISTS'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = await mkdtemp(path.join(config.artifactRoot, `.${config.jobId}-`));
  try {
    const env = buildEnvironment();
    await run('npm', ['run', 'check'], root, env);
    await run('npm', ['run', 'test:unit'], root, env);
    await run('npm', ['run', 'test:content'], root, env);
    await run('npm', ['run', 'test:e2e'], root, env);
    await run('npm', ['run', 'test:a11y'], root, env);
    await run('npm', ['run', 'test:seo'], root, env);
    const dist = path.join(root, 'apps/web/dist');
    await cp(dist, path.join(temporary, 'site'), { recursive: true, errorOnExist: true, force: false });
    const publication = {
      sourceManifestHash: manifest.manifestHash,
      buildId: manifest.buildId,
      createdAt: manifest.createdAt,
      versions: publicVersions(manifest.versions),
    };
    const publicationPath = path.join(temporary, 'site', '_admin', 'publication.json');
    await mkdir(path.dirname(publicationPath), { recursive: true });
    await writeFile(publicationPath, `${JSON.stringify(publication)}\n`, { mode: 0o644, flag: 'wx' });
    const artifactHash = await artifactDigest(path.join(temporary, 'site'));
    await writeFile(path.join(temporary, '.lavbe-artifact.json'), `${JSON.stringify({ artifactHash, jobId: config.jobId, manifestHash: manifest.manifestHash })}\n`, { mode: 0o600, flag: 'wx' });
    await mkdir(config.artifactRoot, { recursive: true, mode: 0o700 });
    await rename(temporary, directory);
    return { directory, artifactHash };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function deploy(config, directory, expectedHash) {
  const adapter = process.env.LAVBE_RUNNER_DEPLOY_ADAPTER;
  if (!adapter || !path.isAbsolute(adapter)) throw new Error('DEPLOY_NOT_CONFIGURED');
  const executable = await stat(adapter).catch(() => null);
  if (!executable?.isFile()) throw new Error('DEPLOY_ADAPTER_INVALID');
  const site = path.join(directory, 'site');
  if (await artifactDigest(site) !== expectedHash) throw new Error('ARTIFACT_HASH_MISMATCH');
  const deployEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('LAVBE_DEPLOY_') && key !== 'LAVBE_RUNNER_DEPLOY_ADAPTER')),
    PATH: process.env.PATH ?? '',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.LAVBE_STATIC_PUBLISH_ROOT ? { LAVBE_STATIC_PUBLISH_ROOT: process.env.LAVBE_STATIC_PUBLISH_ROOT } : {}),
    LAVBE_DEPLOY_ARTIFACT_DIR: site,
    LAVBE_DEPLOY_ARTIFACT_HASH: expectedHash,
    LAVBE_DEPLOY_JOB_ID: config.jobId,
  };
  if (path.extname(adapter) === '.mjs' || path.extname(adapter) === '.js') await run(process.execPath, [adapter], root, deployEnv);
  else await run(adapter, [], root, deployEnv);
  if (await artifactDigest(site) !== expectedHash) throw new Error('DEPLOY_ADAPTER_MUTATED_ARTIFACT');
}

async function waitForPromotion(config, manifest, initialArtifact, dependencies = {}) {
  const apiRequest = dependencies.request ?? request;
  const reportState = dependencies.report ?? report;
  const deployArtifact = dependencies.deploy ?? deploy;
  let latestManifest = manifest;
  while (true) {
    if (dependencies.sleep) await dependencies.sleep(dependencies.pollIntervalMs ?? 5000);
    else await new Promise((resolve) => setTimeout(resolve, dependencies.pollIntervalMs ?? 5000));
    latestManifest = await apiRequest(config, 'manifest');
    if (!verifyManifestSignature(latestManifest, config.publicKey)) throw new Error('MANIFEST_SIGNATURE_INVALID');
    if (latestManifest.state === 'deploying') {
      await deployArtifact(config, initialArtifact.directory, initialArtifact.artifactHash);
      await reportState(config, 'succeeded', initialArtifact.artifactHash);
      return;
    }
    if (latestManifest.state === 'failed' || latestManifest.state === 'succeeded' || latestManifest.state === 'rolled-back') return;
  }
}

export async function runJob(config = validateConfig(), dependencies = {}) {
  const apiRequest = dependencies.request ?? request;
  const reportState = dependencies.report ?? report;
  const build = dependencies.buildArtifact ?? buildArtifact;
  const deployArtifact = dependencies.deploy ?? deploy;
  const [repoRootReal, artifactCandidate, publicRootReal] = await Promise.all([realpath(root), realPathWithMissingTail(config.artifactRoot), realPathWithMissingTail(config.publicRoot)]);
  if (artifactCandidate === repoRootReal || artifactCandidate.startsWith(`${repoRootReal}${path.sep}`)) throw new Error('RUNNER_ARTIFACT_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY');
  if (artifactCandidate === publicRootReal || artifactCandidate.startsWith(`${publicRootReal}${path.sep}`) || publicRootReal.startsWith(`${artifactCandidate}${path.sep}`)) throw new Error('RUNNER_ARTIFACT_DIRECTORY_MUST_BE_OUTSIDE_PUBLIC_ROOT');
  await mkdir(config.artifactRoot, { recursive: true, mode: 0o700 });
  await chmod(config.artifactRoot, 0o700);
  const artifactRootReal = await realpath(config.artifactRoot);
  if (artifactRootReal === repoRootReal || artifactRootReal.startsWith(`${repoRootReal}${path.sep}`)) throw new Error('RUNNER_ARTIFACT_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY');
  if (artifactRootReal === publicRootReal || artifactRootReal.startsWith(`${publicRootReal}${path.sep}`) || publicRootReal.startsWith(`${artifactRootReal}${path.sep}`)) throw new Error('RUNNER_ARTIFACT_DIRECTORY_MUST_BE_OUTSIDE_PUBLIC_ROOT');
  const manifest = await apiRequest(config, 'manifest');
  try {
    if (!verifyManifestSignature(manifest, config.publicKey)) throw new Error('MANIFEST_SIGNATURE_INVALID');
    if (manifest.mode === 'rollback') {
      if (!/^[a-f0-9]{64}$/.test(manifest.rollbackArtifactHash ?? '') || manifest.artifactHash !== manifest.rollbackArtifactHash) throw new Error('ROLLBACK_TARGET_INVALID');
      const directory = await findArtifact(config, manifest.rollbackArtifactHash);
      await reportState(config, 'deploying', manifest.rollbackArtifactHash);
      await deployArtifact(config, directory, manifest.rollbackArtifactHash);
      await reportState(config, 'succeeded', manifest.rollbackArtifactHash);
      return;
    }
    if (manifest.state === 'deploying') {
      if (manifest.mode !== 'publish' || !/^[a-f0-9]{64}$/.test(manifest.artifactHash ?? '')) throw new Error('APPROVED_ARTIFACT_HASH_MISSING');
      const directory = path.join(config.artifactRoot, config.jobId);
      const metadata = JSON.parse(await readFile(path.join(directory, '.lavbe-artifact.json'), 'utf8'));
      if (!manifest.artifactHash || metadata.artifactHash !== manifest.artifactHash || await artifactDigest(path.join(directory, 'site')) !== manifest.artifactHash) throw new Error('ARTIFACT_HASH_MISMATCH');
      await deployArtifact(config, directory, manifest.artifactHash);
      await reportState(config, 'succeeded', manifest.artifactHash);
      return;
    }
    if (manifest.state === 'awaiting-promotion') {
      if (manifest.mode !== 'publish' || !/^[a-f0-9]{64}$/.test(manifest.artifactHash ?? '')) throw new Error('APPROVED_ARTIFACT_HASH_MISSING');
      const directory = path.join(config.artifactRoot, config.jobId);
      const metadata = JSON.parse(await readFile(path.join(directory, '.lavbe-artifact.json'), 'utf8'));
      if (!manifest.artifactHash || metadata.artifactHash !== manifest.artifactHash || await artifactDigest(path.join(directory, 'site')) !== manifest.artifactHash) throw new Error('ARTIFACT_HASH_MISMATCH');
      await waitForPromotion(config, manifest, { directory, artifactHash: metadata.artifactHash }, dependencies);
      return;
    }
    validateManifest(manifest);
    validateManifestContent(manifest);
    if (manifest.state !== 'building') await reportState(config, 'validating');
    const currentSourceManifest = canonicalJson(manifest.versions);
    if (createHash('sha256').update(currentSourceManifest, 'utf8').digest('hex') !== manifest.manifestHash) throw new Error('MANIFEST_DIGEST_MISMATCH');
    await reportState(config, 'building');
    let artifact;
    const existingDirectory = path.join(config.artifactRoot, config.jobId);
    try {
      const metadata = JSON.parse(await readFile(path.join(existingDirectory, '.lavbe-artifact.json'), 'utf8'));
      if (metadata.manifestHash !== manifest.manifestHash || await artifactDigest(path.join(existingDirectory, 'site')) !== metadata.artifactHash) throw new Error('ARTIFACT_HASH_MISMATCH');
      artifact = { directory: existingDirectory, artifactHash: metadata.artifactHash };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      artifact = await build(config, manifest);
    }
    await reportState(config, 'awaiting-promotion', artifact.artifactHash);
    await waitForPromotion(config, manifest, artifact, dependencies);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RUNNER_FAILED';
    const stableCode = /^[A-Z][A-Z0-9_]{2,99}$/.test(message) ? message : 'RUNNER_FAILED';
    try { await reportState(config, 'failed', null, stableCode); } catch { /* The runner credential may have expired; preserve the original local failure. */ }
    throw new Error(stableCode, { cause: error });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runJob().then(() => process.exit(0)).catch((error) => {
    process.stderr.write(`Lavbe trusted runner stopped: ${error instanceof Error ? error.message : 'RUNNER_FAILED'}\n`);
    process.exit(1);
  });
}
