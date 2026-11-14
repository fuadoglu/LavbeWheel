import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = path.join(root, 'contracts');
const outputDir = path.join(root, 'packages/contracts/src/generated');
const check = process.argv.includes('--check');
await mkdir(outputDir, { recursive: true });
const schemas = (await readdir(schemaDir)).filter((file) => file.endsWith('.schema.json')).sort();
for (const filename of schemas) {
  const schema = JSON.parse(await readFile(path.join(schemaDir, filename), 'utf8'));
  const name = filename.replace(/\.schema\.json$/, '').split(/[-_]/).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  const content = await compile(schema, name, {
    bannerComment: '/* Generated from contracts/*.schema.json. Do not edit by hand. */',
    style: { singleQuote: true, semi: true },
    ignoreMinAndMaxItems: true,
    unreachableDefinitions: true,
    strictIndexSignatures: true,
  });
  const output = path.join(outputDir, `${name}.ts`);
  if (check) {
    let existing;
    try { existing = await readFile(output, 'utf8'); } catch { existing = ''; }
    if (existing !== content) {
      console.error(`Generated contract is stale: ${path.relative(root, output)} (run npm run contracts:generate)`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(output, content);
    console.log(`Generated ${path.relative(root, output)}`);
  }
}
