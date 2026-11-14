import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../apps/web/dist/index.html', import.meta.url), 'utf8');
const iconLicense = await readFile(new URL('../apps/web/dist/licenses/phosphor-MIT.txt', import.meta.url), 'utf8');
const required = [/<html\s+lang="az"/i, /<title>Lavbe — Seç\. Fırlat\. Birlikdə oyna\.<\/title>/, /<link rel="canonical" href="https:\/\/lavbe\.com\/"\s*\/?\s*>/i, /<meta name="description"/i, /<h1[^>]*id="page-title"/i, /id="wheel-canvas"/];
const failures = required.flatMap((pattern) => pattern.test(html) ? [] : [`Built root page is missing ${pattern}`]);
if (!iconLicense.includes('Copyright (c) 2023 Phosphor Icons') || !iconLicense.includes('MIT License')) failures.push('Distributed Phosphor SVG asset license is missing from static output');
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log('PASS: built root HTML includes locale, title, description, semantic heading and interactive canvas mount. Route coverage and production origin are not verified.');
