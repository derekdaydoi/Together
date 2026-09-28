import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the release from /Together/, while the local
  // development server must resolve assets and auth callbacks from /.
  base: command === 'build' ? '/Together/' : '/',
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
}))
