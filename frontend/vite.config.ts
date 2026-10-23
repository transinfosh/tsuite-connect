import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  base: '/connect/',
  build: { outDir: '../console/static', emptyOutDir: true, sourcemap: false },
  server: {
    proxy: { '/connect/api': 'http://127.0.0.1:8765', '/connect/login': 'http://127.0.0.1:8765' },
  },
})
