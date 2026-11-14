import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'json-schema-to-typescript';
import { Ajv2020 } from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

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

const sessionSchema = JSON.parse(await readFile(path.join(schemaDir, 'session.schema.json'), 'utf8'));
const sessionValidatorAjv = new Ajv2020({ code: { source: true, esm: true }, strict: true, strictRequired: false, strictTypes: false, validateFormats: false });
const validator = sessionValidatorAjv.compile(sessionSchema);
const validatorOutput = path.join(root, 'packages/session/src/generated/session-schema-validator.js');
const standaloneValidator = standaloneCode(sessionValidatorAjv, validator)
  .replaceAll('require("ajv/dist/runtime/ucs2length").default', 'sessionUcs2Length');
const validatorCode = `function sessionUcs2Length(value) { let length = 0; for (let index = 0; index < value.length; index += 1) { length += 1; const code = value.charCodeAt(index); if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) { const next = value.charCodeAt(index + 1); if ((next & 0xfc00) === 0xdc00) index += 1; } } return length; }\n${standaloneValidator}\n`;
const validatorDeclaration = `declare const validate: ((data: unknown) => boolean) & { errors: Array<{ instancePath: string; message?: string }> | null };\nexport default validate;\n`;
if (check) {
  let existing;
  try { existing = await readFile(validatorOutput, 'utf8'); } catch { existing = ''; }
  if (existing !== validatorCode) {
    console.error(`Generated session validator is stale: ${path.relative(root, validatorOutput)} (run npm run contracts:generate)`);
    process.exitCode = 1;
  }
  let existingDeclaration;
  try { existingDeclaration = await readFile(validatorOutput.replace(/\.js$/, '.d.ts'), 'utf8'); } catch { existingDeclaration = ''; }
  if (existingDeclaration !== validatorDeclaration) {
    console.error(`Generated session validator declaration is stale: ${path.relative(root, validatorOutput.replace(/\.js$/, '.d.ts'))} (run npm run contracts:generate)`);
    process.exitCode = 1;
  }
} else {
  await mkdir(path.dirname(validatorOutput), { recursive: true });
  await writeFile(validatorOutput, validatorCode);
  await writeFile(validatorOutput.replace(/\.js$/, '.d.ts'), validatorDeclaration);
  console.log(`Generated ${path.relative(root, validatorOutput)}`);
}
