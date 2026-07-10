import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api/fastapi': {
        target: 'http://127.0.0.1:18081',
        rewrite: (path) => path.replace(/^\/api\/fastapi/, '/api/waves'),
      },
      '/api/express': {
        target: 'http://127.0.0.1:18082',
        rewrite: (path) => path.replace(/^\/api\/express/, '/api/waves'),
      },
    },
  },
})

