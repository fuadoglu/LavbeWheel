export type SitemapRoute = { locale: string; path: string };
export type SitemapArtifacts = { indexFile: string | null; files: Map<string, string>; urlFiles: Map<string, string> };

const protocolLimit = 10 * 1024 * 1024;
const urlLimit = 5_000;
const escapeXml = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function buildSitemapArtifacts(routes: readonly SitemapRoute[], origin: string): SitemapArtifacts {
  if (!routes.length) return { indexFile: null, files: new Map(), urlFiles: new Map() };
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) throw new Error('Sitemap origin must be a clean HTTPS origin.');
  const seen = new Set<string>();
  const grouped = new Map<string, string[]>();
  for (const route of routes) {
    if (!/^[A-Za-z0-9-]+$/.test(route.locale) || !route.path.startsWith('/') || /[?#\\]/.test(route.path) || route.path.split('/').some((part) => part === '.' || part === '..')) throw new Error('Sitemap route must have a valid locale and clean absolute path.');
    if (route.path !== '/' && !route.path.endsWith('/')) throw new Error('Sitemap route must use a normalized trailing slash.');
    const url = new URL(route.path, base);
    if (url.origin !== base.origin || url.search || url.hash) throw new Error('Sitemap route must be a clean same-origin canonical URL.');
    if (seen.has(url.href)) throw new Error(`Duplicate sitemap URL: ${url.href}`);
    seen.add(url.href);
    const urls = grouped.get(route.locale) ?? [];
    urls.push(url.href);
    grouped.set(route.locale, urls);
  }

  const files = new Map<string, string>();
  const urlFiles = new Map<string, string>();
  const sitemapNames: string[] = [];
  for (const [locale, urls] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = urls.sort();
    let chunk: Array<{ url: string; line: string }> = [];
    let chunkBytes = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n').byteLength;
    let chunkIndex = 1;
    const flush = () => {
      if (!chunk.length) return;
      const filename = `sitemap-${locale}-${chunkIndex}.xml`;
      const body = chunk.map(({ line }) => line).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
      if (new TextEncoder().encode(xml).byteLength >= protocolLimit) throw new Error(`Sitemap ${filename} exceeds the 10 MiB uncompressed limit.`);
      files.set(filename, xml);
      for (const { url } of chunk) urlFiles.set(url, filename);
      sitemapNames.push(filename);
      chunk = [];
      chunkBytes = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n').byteLength;
      chunkIndex += 1;
    };
    for (const url of sorted) {
      const line = `  <url><loc>${escapeXml(url)}</loc></url>`;
      const lineBytes = new TextEncoder().encode(line).byteLength;
      const separatorBytes = chunk.length ? 1 : 0;
      const closingBytes = new TextEncoder().encode('</urlset>\n').byteLength;
      if (chunk.length && (chunk.length >= urlLimit || chunkBytes + separatorBytes + lineBytes + closingBytes >= protocolLimit)) flush();
      const currentSeparatorBytes = chunk.length ? 1 : 0;
      const singleBytes = chunkBytes + currentSeparatorBytes + lineBytes + closingBytes;
      if (singleBytes >= protocolLimit) throw new Error('A single sitemap URL exceeds the 10 MiB uncompressed limit.');
      chunk.push({ url, line });
      chunkBytes += currentSeparatorBytes + lineBytes;
    }
    flush();
  }

  const entries = sitemapNames.map((filename) => `  <sitemap><loc>${escapeXml(new URL(`/${filename}`, base).href)}</loc></sitemap>`).join('\n');
  const index = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
  if (new TextEncoder().encode(index).byteLength >= protocolLimit) throw new Error('Sitemap index exceeds the 10 MiB uncompressed limit.');
  return { indexFile: 'sitemap-index.xml', files: new Map([['sitemap-index.xml', index], ...files]), urlFiles };
}
