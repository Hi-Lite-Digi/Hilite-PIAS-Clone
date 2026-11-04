import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { handleApiRequest } from './worker/supabase-api.js'

const configDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '')
  return {
  server: {
    port: 5199,
    strictPort: true,
  },
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(configDirectory, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'hihunt-supabase-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next()
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const body = chunks.length ? Buffer.concat(chunks) : undefined
          const request = new Request(`http://127.0.0.1${req.url}`, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          })
          const response = await handleApiRequest(request, serverEnv)
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        })
      },
    },
  ],
  }
})
