import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['vue', '@wave-counter/client', '@lucide/vue'],
      output: { assetFileNames: 'styles.css' },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
