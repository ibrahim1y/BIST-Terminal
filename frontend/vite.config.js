import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Geliştirmede /api istekleri backend'e yönlendirilir. Yayında site ve API aynı adresten sunulur.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
