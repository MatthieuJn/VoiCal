import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// En local (npm run dev), sert les fonctions de /api comme le ferait Vercel.
function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      Object.assign(process.env, env)
      server.middlewares.use(async (req, res, next) => {
        const route = req.url.split('?')[0].match(/^\/api\/([a-z-]+)$/)
        if (!route) return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        try { req.body = raw ? JSON.parse(raw) : {} } catch { req.body = {} }
        res.status = code => { res.statusCode = code; return res }
        res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
        try {
          const mod = await server.ssrLoadModule(`/api/${route[1]}.js`)
          await mod.default(req, res)
        } catch (e) {
          res.status(500).json({ error: e.message })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    localApi(loadEnv(mode, process.cwd(), '')),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Voical – Suivi nutritionnel',
        short_name: 'Voical',
        description: 'Suivi de calories et macronutriments',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
}))
