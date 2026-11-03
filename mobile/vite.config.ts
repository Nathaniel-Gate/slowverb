import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

// '@app' = the Mac app's renderer code (pure parts are shared: audio chain, reverb maths, fx presets, theme tokens, Knob).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@app': resolve(__dirname, '../src/renderer/src'), '@shared': resolve(__dirname, '../src/shared') } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', target: 'es2022' }
})
