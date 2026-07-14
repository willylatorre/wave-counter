import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@waves-counter/client'],
      output: { assetFileNames: 'styles.css' },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
