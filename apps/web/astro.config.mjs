import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lavbe.com',
  output: 'static',
  devToolbar: { enabled: false },
  build: { format: 'directory' },
  security: { checkOrigin: true },
});
