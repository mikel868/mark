import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  build: {
    // Element Plus is intentionally bundled as the single shared UI dependency.
    chunkSizeWarningLimit: 1100,
  },
  server: {
    host: '0.0.0.0',
    port: 5176,
    strictPort: true,
    proxy: { '/api': { target: process.env.BACKEND_URL ?? 'http://127.0.0.1:8080' } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'tests/smoke/**', 'node_modules/**', 'dist/**'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
