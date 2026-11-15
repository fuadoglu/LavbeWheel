import { spawn } from 'node:child_process';

const portIndex = process.argv.indexOf('--port');
const port = String(portIndex >= 0 ? process.argv[portIndex + 1] : '4326');
const fixture = {
  id: 'optional_tags', enabled: true, gtmId: null, ga4Id: 'G-TEST1234',
  publisherId: null, cmpProvider: null, placements: [],
};
const child = spawn('npm', ['run', 'dev', '--workspace', '@lavbe/web', '--', '--ignore-lock', '--port', port], {
  env: { ...process.env, PUBLIC_LAVBE_OPTIONAL_TAGS_JSON: JSON.stringify(fixture) },
  stdio: 'inherit',
  shell: false,
});
child.once('error', (error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
child.once('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
