import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16)),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        id: '/',
        name: 'Anilha',
        short_name: 'Anilha',
        description: 'Treino de musculação e corrida guiado pelo seu próprio plano da semana.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fafafa',
        theme_color: '#fafafa',
        categories: ['health', 'fitness', 'sports'],
        // Holding the icon (Android, Chrome on the computer): straight to the most used.
        shortcuts: [
          {
            name: 'Treino de hoje',
            short_name: 'Treino',
            description: 'Começa o treino do dia',
            url: '/?atalho=treino',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Registrar corrida',
            short_name: 'Corrida',
            description: 'Anota uma corrida ou outro cardio',
            url: '/?atalho=corrida',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Histórico',
            short_name: 'Histórico',
            description: 'Treinos, progresso e semanas',
            url: '/historico',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Real screens: Android and desktop Chrome show them in the install dialog.
        screenshots: [
          {
            src: '/screenshots/hoje.webp',
            sizes: '1170x2532',
            type: 'image/webp',
            form_factor: 'narrow',
            label: 'Hoje: o treino do dia e o porquê',
          },
          {
            src: '/screenshots/treino-serie.webp',
            sizes: '1170x2532',
            type: 'image/webp',
            form_factor: 'narrow',
            label: 'Treino: carga já preenchida, um toque por série',
          },
          {
            src: '/screenshots/desktop-hoje.webp',
            sizes: '1440x900',
            type: 'image/webp',
            form_factor: 'wide',
            label: 'Anilha no computador',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        // The landing and the legal pages are static pages: the app's offline shell must
        // not answer them, and they stay out of the app's precache.
        navigateFallbackDenylist: [/^\/api\//, /^\/conheca/, /^\/privacidade/, /^\/termos/],
        // The management panel too: only its admin downloads it, when opening it.
        globIgnores: ['conheca/**', 'privacidade/**', 'termos/**', 'assets/Admin-*.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['/push-sw.js'],
        // Exercise media from our storage: kept after the first view, for the gym without signal.
        runtimeCaching: [
          {
            urlPattern: /\/storage\/v1\/object\/public\/midia-exercicios\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'midia-exercicios',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase';
          if (
            id.includes('node_modules/react') ||
            id.includes('react-router') ||
            id.includes('scheduler')
          )
            return 'react';
          if (id.includes('dexie')) return 'dexie';
          return undefined;
        },
      },
    },
  },
});
