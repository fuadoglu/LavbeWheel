import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestName = 'release-manifest.json';
const forbiddenContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /LAVBE_(?:DATABASE_PASSWORD|ENCRYPTION_KEY|RATE_KEY|MANIFEST_SIGNING_SECRET_KEY)\s*=\s*[A-Za-z0-9+/=_-]{16,}/,
];

function fail(code) { throw new Error(code); }

async function copyTree(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) fail('PACKAGE_SYMLINK_NOT_ALLOWED');
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true, mode: 0o755 });
    for (const name of (await readdir(source)).sort()) {
      if (name === '.env' || name.startsWith('.env.')) continue;
      await copyTree(path.join(source, name), path.join(destination, name));
    }
  } else if (info.isFile()) {
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
    await copyFile(source, destination);
  } else fail('PACKAGE_SPECIAL_FILE_NOT_ALLOWED');
}

async function listFiles(directory, base = directory) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(base, full).split(path.sep).join('/');
    const info = await lstat(full);
    if (info.isSymbolicLink()) fail('PACKAGE_SYMLINK_NOT_ALLOWED');
    if (info.isDirectory()) files.push(...await listFiles(full, base));
    else if (info.isFile()) files.push({ full, path: relative });
    else fail('PACKAGE_SPECIAL_FILE_NOT_ALLOWED');
  }
  return files;
}

export async function inspect(directory) {
  const allFiles = await listFiles(directory);
  const files = allFiles.filter((entry) => entry.path !== manifestName);
  const records = [];
  const tree = createHash('sha256');
  for (const entry of files) {
    if (/(^|\/)\.env(?:\.|$)/i.test(entry.path) || /(?:^|\/)(?:id_rsa|id_ed25519|server\.key|private-key\.pem)$/i.test(entry.path)) {
      fail('PACKAGE_SECRET_FILE_DETECTED');
    }
    const data = await readFile(entry.full);
    const content = data.toString('utf8');
    if (forbiddenContent.some((pattern) => pattern.test(content))) fail(`PACKAGE_SECRET_PATTERN_DETECTED:${entry.path}`);
    const digest = createHash('sha256').update(data).digest('hex');
    records.push({ path: entry.path, bytes: data.length, sha256: digest });
    const name = Buffer.from(entry.path, 'utf8');
    const lengths = Buffer.alloc(12);
    lengths.writeUInt32BE(name.length, 0);
    lengths.writeBigUInt64BE(BigInt(data.length), 4);
    tree.update(lengths).update(name).update(data);
  }
  return { files: records, treeSha256: tree.digest('hex') };
}

export async function verifyPackage(directory) {
  const manifestPath = path.join(directory, manifestName);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.formatVersion !== 1 || manifest.kind !== 'internal-release-candidate') fail('PACKAGE_MANIFEST_INVALID');
  const actual = await inspect(directory);
  if (actual.treeSha256 !== manifest.treeSha256 || JSON.stringify(actual.files) !== JSON.stringify(manifest.files)) {
    fail('PACKAGE_FILE_INTEGRITY_MISMATCH');
  }
  return manifest;
}

function gitValue(...args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function releaseBlockers(progress) {
  const blockers = progress.workPackages
    .filter((item) => item.status !== 'verified')
    .map((item) => `${item.id} is ${item.status}`);
  for (const item of progress.workPackages) blockers.push(...(item.blockers ?? []).map((value) => `${item.id}: ${value}`));
  return [...new Set(blockers)];
}

async function createPackage(outputInput) {
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const staticRoot = path.join(root, 'apps/web/dist');
  const apiRoot = path.join(root, 'apps/api');
  for (const required of [path.join(staticRoot, 'index.html'), path.join(apiRoot, 'public/index.php'), path.join(apiRoot, 'vendor/autoload.php')]) {
    try { await readFile(required); } catch { fail(`PACKAGE_INPUT_MISSING:${path.relative(root, required)}`); }
  }
  const pwa = JSON.parse(await readFile(path.join(staticRoot, 'pwa-precache.json'), 'utf8'));
  const seo = JSON.parse(await readFile(path.join(staticRoot, 'seo-audit.json'), 'utf8'));
  const progress = JSON.parse(await readFile(path.join(root, 'docs/progress.json'), 'utf8'));
  const contractPackage = JSON.parse(await readFile(path.join(root, 'packages/contracts/package.json'), 'utf8'));
  const blockers = releaseBlockers(progress);
  const defaultName = `lavbewheel-${pwa.buildId}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let output = path.resolve(outputInput ?? path.join(root, 'release-artifacts', defaultName));
  const parent = path.dirname(output);
  await mkdir(parent, { recursive: true });
  output = path.join(await realpath(parent), path.basename(output));
  const allowedInternal = path.join(root, 'release-artifacts') + path.sep;
  if (output.startsWith(root + path.sep) && !output.startsWith(allowedInternal)) fail('PACKAGE_OUTPUT_MUST_BE_OUTSIDE_SOURCE_TREE');
  try { await lstat(output); fail('PACKAGE_OUTPUT_ALREADY_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = path.join(parent, `.${path.basename(output)}-${process.pid}.tmp`);
  try { await lstat(staging); fail('PACKAGE_STAGING_PATH_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(staging, { recursive: false, mode: 0o755 });
  try {
    await copyTree(staticRoot, path.join(staging, 'public'));
    const apiDestination = path.join(staging, 'apps/api');
    await mkdir(apiDestination, { recursive: true });
    for (const name of ['bin', 'database', 'public', 'src', 'vendor']) {
      await copyTree(path.join(apiRoot, name), path.join(apiDestination, name));
    }
    for (const name of ['composer.json', 'composer.lock', 'README.md']) {
      await copyTree(path.join(apiRoot, name), path.join(apiDestination, name));
    }
    await copyTree(path.join(root, 'contracts'), path.join(staging, 'contracts'));
    await mkdir(path.join(staging, 'deployment'), { recursive: true });
    await copyFile(path.join(root, 'docs/17-OPERATIONS.md'), path.join(staging, 'deployment/OPERATIONS.md'));
    await copyFile(path.join(root, 'docs/16-ACCEPTANCE.md'), path.join(staging, 'deployment/ACCEPTANCE.md'));

    const inspected = await inspect(staging);
    const manifest = {
      formatVersion: 1,
      kind: 'internal-release-candidate',
      releaseStatus: blockers.length ? 'blocked' : 'requires-owner-approval',
      createdAt: new Date().toISOString(),
      source: { branch: gitValue('branch', '--show-current'), commit: gitValue('rev-parse', 'HEAD') },
      build: {
        id: pwa.buildId,
        nodeEngine: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).engines.node,
        phpRequirement: JSON.parse(await readFile(path.join(apiRoot, 'composer.json'), 'utf8')).require.php,
        contractPackageVersion: contractPackage.version,
      },
      publicRoutes: {
        implemented: seo.implementedPublicRouteCount,
        planned: seo.plannedPublicRouteCount,
        indexable: seo.indexablePublicRouteCount,
        indexingAllowed: seo.indexablePublicRouteCount > 0,
        seoReadiness: seo.result,
      },
      files: inspected.files,
      treeSha256: inspected.treeSha256,
      blockers,
      notice: 'Integrity and secret-pattern scan only. This package is not deployment approval, legal/security certification, or proof of host compatibility.',
    };
    await writeFile(path.join(staging, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
    await rename(staging, output);
    const verified = await verifyPackage(output);
    process.stdout.write(`Release candidate package created: ${output}\nBuild: ${verified.build.id}\nTree SHA-256: ${verified.treeSha256}\nStatus: ${verified.releaseStatus}\nFiles: ${verified.files.length}\n`);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--verify') {
      const directory = process.argv[3];
      if (!directory || !path.isAbsolute(directory)) fail('PACKAGE_VERIFY_REQUIRES_ABSOLUTE_PATH');
      const manifest = await verifyPackage(directory);
      process.stdout.write(`PASS: package integrity and secret-pattern scan; ${manifest.files.length} files; ${manifest.releaseStatus}.\n`);
    } else {
      const output = process.argv[2] === '--output' ? process.argv[3] : undefined;
      if (process.argv.length > 2 && !output) fail('PACKAGE_OUTPUT_ARGUMENT_INVALID');
      await createPackage(output);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'PACKAGE_FAILED'}\n`);
    process.exitCode = 1;
  }
}
