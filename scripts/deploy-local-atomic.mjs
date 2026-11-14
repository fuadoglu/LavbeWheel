import { cp, mkdir, mkdtemp, realpath, rename, rm, lstat, readlink, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { artifactDigest } from './admin-build-runner.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

export async function deployLocal({ artifactDirectory, artifactHash, jobId, publishRoot }) {
  if (!path.isAbsolute(publishRoot) || !/^[A-Za-z0-9_-]{8,64}$/.test(jobId) || !/^[a-f0-9]{64}$/.test(artifactHash)) throw new Error('LOCAL_DEPLOY_INPUT_INVALID');
  if (await artifactDigest(artifactDirectory) !== artifactHash) throw new Error('LOCAL_DEPLOY_ARTIFACT_HASH_MISMATCH');
  const [repositoryReal, rootCandidate] = await Promise.all([realpath(repoRoot), realPathWithMissingTail(publishRoot)]);
  if (rootCandidate === repositoryReal || rootCandidate.startsWith(`${repositoryReal}${path.sep}`)) throw new Error('LOCAL_DEPLOY_ROOT_MUST_BE_OUTSIDE_REPOSITORY');
  await mkdir(publishRoot, { recursive: true, mode: 0o755 });
  const rootReal = await realpath(publishRoot);
  if (rootReal === repositoryReal || rootReal.startsWith(`${repositoryReal}${path.sep}`)) throw new Error('LOCAL_DEPLOY_ROOT_MUST_BE_OUTSIDE_REPOSITORY');
  const releases = path.join(rootReal, 'releases');
  await mkdir(releases, { recursive: true, mode: 0o755 });
  const releaseName = `${jobId}-${artifactHash.slice(0, 16)}`;
  const releasePath = path.join(releases, releaseName);
  let releaseExists = false;
  try {
    await lstat(releasePath);
    releaseExists = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (releaseExists) {
    if (!(await lstat(releasePath)).isDirectory() || (await lstat(releasePath)).isSymbolicLink()) throw new Error('LOCAL_DEPLOY_EXISTING_RELEASE_INVALID');
    if (await artifactDigest(releasePath) !== artifactHash) throw new Error('LOCAL_DEPLOY_EXISTING_RELEASE_MISMATCH');
  } else {
    const temporaryRelease = await mkdtemp(path.join(releases, `.${jobId}-`));
    try {
      await rm(temporaryRelease, { recursive: true, force: true });
      await cp(artifactDirectory, temporaryRelease, { recursive: true, errorOnExist: true, force: false });
      if (await artifactDigest(temporaryRelease) !== artifactHash) throw new Error('LOCAL_DEPLOY_COPY_HASH_MISMATCH');
      await rename(temporaryRelease, releasePath);
    } catch (error) {
      await rm(temporaryRelease, { recursive: true, force: true });
      throw error;
    }
  }
  const current = path.join(rootReal, 'current');
  try {
    const info = await lstat(current);
    if (!info.isSymbolicLink()) throw new Error('LOCAL_DEPLOY_CURRENT_MUST_BE_SYMLINK');
    await readlink(current);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporaryLink = path.join(rootReal, `.current-${jobId}`);
  await rm(temporaryLink, { force: true });
  await symlink(path.join('releases', releaseName), temporaryLink, 'dir');
  try { await rename(temporaryLink, current); }
  catch (error) { await rm(temporaryLink, { force: true }); throw error; }
  return current;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const artifactDirectory = process.env.LAVBE_DEPLOY_ARTIFACT_DIR;
  const artifactHash = process.env.LAVBE_DEPLOY_ARTIFACT_HASH;
  const jobId = process.env.LAVBE_DEPLOY_JOB_ID;
  const publishRoot = process.env.LAVBE_STATIC_PUBLISH_ROOT;
  if (!artifactDirectory || !artifactHash || !jobId || !publishRoot) {
    process.stderr.write('Local atomic deploy adapter configuration is incomplete.\n');
    process.exit(2);
  }
  deployLocal({ artifactDirectory, artifactHash, jobId, publishRoot }).then((current) => {
    process.stdout.write(`Static release atomically switched: ${current}\n`);
  }).catch((error) => {
    process.stderr.write(`Static release was not switched: ${error instanceof Error ? error.message : 'LOCAL_DEPLOY_FAILED'}\n`);
    process.exit(1);
  });
}
