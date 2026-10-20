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
          'Free and private period and cycle tracking that works offline. Log flow, symptoms, moods, BBT, medicines and more — stored first on your device, with optional encrypted cloud sync. Calendar-method predictions plus fertility-sign insights. No ads. No account needed.',
        start_url: '/',
        id: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // tapping the launcher/shortcut focuses the open app window instead of
        // forking a second one
        launch_handler: { client_mode: 'navigate-existing' },
        background_color: '#fff6f8',
        theme_color: '#e11d63',
        categories: ['health', 'lifestyle', 'medical'],
        // richer install UI (Chrome Android 94+): store-style install dialog
        screenshots: [
          { src: '/icons/screen-home.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Cycle dashboard with today\u2019s phase and predictions' },
          { src: '/icons/screen-calendar.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Calendar of logged days, fertile window and predictions' },
          { src: '/icons/screen-insights.png', sizes: '1080x2340', type: 'image/png', form_factor: 'narrow', label: 'Cycle statistics, regularity and trend charts' },
          { src: '/icons/wide-home.png', sizes: '2560x1600', type: 'image/png', form_factor: 'wide', label: 'Cycle dashboard on desktop' },
          { src: '/icons/wide-insights.png', sizes: '2560x1600', type: 'image/png', form_factor: 'wide', label: 'Cycle insights on desktop' },
        ],
        // long-press quick actions on Android; Chrome shows up to 3 (one slot
        // is its own site-settings entry)
        shortcuts: [
          { name: 'Open calendar', short_name: 'Calendar', url: '/?screen=calendar', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Cycle insights', short_name: 'Insights', url: '/?screen=insights', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Read cycle guide', short_name: 'Learn', url: '/?screen=learn', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
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
        // screenshots are only needed in the install dialog (pre-install) —
        // keeping them out of the offline cache
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/_worker.js', 'icons/screen-*.png', 'icons/wide-*.png'],
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
