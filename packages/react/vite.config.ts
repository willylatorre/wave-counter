import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

const isExternalDependency = (id: string) => (
  id === '@waves-counter/client'
  || id === 'react'
  || id.startsWith('react/')
  || id === 'react-dom'
  || id.startsWith('react-dom/')
  || id === '@number-flow/react'
)

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: isExternalDependency,
      output: { assetFileNames: 'styles.css' },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
