import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Cargar variables de entorno
  const env = loadEnv(mode, process.cwd(), '')
  
  const port = parseInt(env.VITE_PORT || process.env.VITE_PORT || '3300')
  const apiUrl = env.VITE_API_URL || process.env.VITE_API_URL || 'http://localhost:3301'
  
  return {
    plugins: [react()],
    server: {
      port: port,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        }
      }
    }
  }
})
