import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Geolocation and camera/microphone access require a secure context.
    // localhost counts as secure, so the SOS and video features work in dev.
    host: 'localhost',
    // Vite rejects requests whose Host header it doesn't recognise, as a
    // defence against DNS rebinding. That's exactly what a cloudflared quick
    // tunnel's *.trycloudflare.com hostname looks like from the outside, so
    // temporary tunnel-based testing needs it explicitly allowed. Only
    // affects `vite dev`, never the production build.
    allowedHosts: ['.trycloudflare.com'],
    // Mirrors the proxy below: client/.env uses a relative VITE_API_URL=/api,
    // and that only resolves to the real API when something on this same
    // origin forwards it. `preview` had this; `dev` did not, which silently
    // broke every API call under `npm run dev` while `npm run preview`
    // worked — the two were never actually equivalent until now.
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
  // Serving the production build is the only practical way to demo through a
  // tunnel: `vite dev` ships every module unbundled, and at ~2s of tunnel
  // latency per request several hundred of those never finish loading.
  preview: {
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
    // Proxying the API through the same origin means one tunnel instead of
    // two: half as much to fail, no CORS, and the baked-in API URL stays
    // relative so a new tunnel hostname never requires a rebuild.
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the heavy, rarely-changing SDKs out of the main bundle so a
        // first paint on a slow connection is not blocked by them.
        manualChunks: {
          agora: ['agora-rtc-sdk-ng'],
          maps: ['leaflet', 'react-leaflet'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
});
