import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : 4324);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.ico', 'image/vnd.microsoft.icon'], ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.woff2', 'font/woff2'], ['.txt', 'text/plain; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
  catch { response.writeHead(400, { 'Cache-Control': 'no-store' }).end(); return; }
  let target = resolve(root, `.${pathname}`);
  const rel = relative(root, target);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    response.writeHead(403, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  try {
    if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': mime.get(extname(target)) ?? 'application/octet-stream',
      'Content-Length': body.byteLength,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': target.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`PWA test server listening at http://127.0.0.1:${port}\n`));
