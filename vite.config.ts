import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain SPA, no server. `npm run build` produces a static `dist/` that any static host can serve.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { target: 'es2022', sourcemap: true },
})
