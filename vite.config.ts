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
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', '_redirects'],
      manifest: {
        name: 'Period Tracker',
        short_name: 'Period Tracker',
        description:
          'Free, private, local-first period and cycle tracking. Your data never leaves your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff6f8',
        theme_color: '#e11d63',
        categories: ['health', 'lifestyle', 'medical'],
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
        navigateFallback: '/index.html',
        // /admin is served by the sync worker and must never fall back to the app shell
        navigateFallbackDenylist: [/^\/admin/, /^\/api\//],
      },
    }),
  ],
  build: {
    sourcemap: false,
  },
});
