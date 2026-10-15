import { defineConfig } from 'astro/config';
import { securityHeaders } from './integrations/headers';
import { site } from './src/site.config';

export default defineConfig({
  site: site.url,
  output: 'static',
  devToolbar: { enabled: false },
  build: {
    // External files only, so the Content-Security-Policy needs no inline allowances.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
    server: {
      // In `pnpm dev`, the `/api` routes come from `wrangler dev`.
      // The original Host is kept so the Worker's same-origin check passes.
      proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
    },
  },
  integrations: [
    securityHeaders({
      connect: [site.presence.api, site.homeserver.baseUrl],
      images: [
        'https://cdn.discordapp.com',
        'https://media.discordapp.net',
        'https://i.scdn.co',
        'https://i.ytimg.com',
        'https://avatars.githubusercontent.com',
      ],
    }),
  ],
});
