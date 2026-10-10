import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    {
      // ship the sync API as a Pages Function alongside the static build
      name: 'copy-api-worker',
      closeBundle() {
        if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
        copyFileSync('api/_worker.js', 'dist/_worker.js');
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', '_redirects'],
      manifest: {
        name: 'Period Tracker',
        short_name: 'Period Tracker',
        description:
          'Free, private, local-first period and cycle tracking.',
        start_url: '/',
        id: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff6f8',
        theme_color: '#e11d63',
        categories: ['health', 'lifestyle', 'medical'],
        share_target: {
          action: '/?share=1',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        file_handlers: [{ action: '/?open=backup', accept: { 'application/json': ['.json'] } }],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/_worker.js'],
        // network-first shell: cached fallback served stale index.html after
        // deploys (referenced assets already purged → broken first view)
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' && !/^\/(admin|api)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              // No networkTimeoutSeconds on purpose. A timeout makes workbox
              // fall back to the CACHED html when the network is slow, and that
              // cached shell references assets the last deploy already purged,
              // so the app renders blank. Without it: online = fresh html
              // always, offline = fetch fails fast and the cache is used.
              cacheName: 'html-nav',
              expiration: { maxEntries: 4 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: false,
  },
});
