import { readFile } from 'node:fs/promises';
const progress = JSON.parse(await readFile(new URL('../docs/progress.json', import.meta.url), 'utf8'));
const incomplete = progress.workPackages.filter((workPackage) => workPackage.status !== 'verified');
if (incomplete.length) {
  console.error(`BLOCKED: full release verification requires all work packages verified. Incomplete: ${incomplete.map((item) => `${item.id}=${item.status}`).join(', ')}.`);
  process.exit(1);
}
const { spawnSync } = await import('node:child_process');
const commands = [
  ['npm', ['run', 'validate:docs']], ['npm', ['run', 'check']], ['npm', ['run', 'test:unit']],
  ['npm', ['run', 'test:api']], ['npm', ['run', 'test:e2e']], ['npm', ['run', 'test:a11y']],
  ['npm', ['run', 'test:seo']], ['npm', ['run', 'test:pwa']], ['npm', ['run', 'test:content']],
  ['npm', ['run', 'build']], ['npm', ['audit', '--audit-level=moderate']],
];
for (const [command, args] of commands) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
