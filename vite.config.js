import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Carga el .env a process.env para las funciones de /api en desarrollo
// (en producción las variables vienen de Vercel; acá no hay dotenv como dependencia).
function cargarEnv() {
  const archivo = path.resolve('.env')
  if (!fs.existsSync(archivo)) return
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !m[1].startsWith('#')) process.env[m[1]] ??= m[2]
  }
}

// Sirve las funciones serverless de /api en `npm run dev`, emulando la firma
// (req.query, req.body, res.status().json()) que usa Vercel. Así se puede
// probar todo en local sin `vercel dev`. Cambios en /api requieren reiniciar.
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      cargarEnv()
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const nombre = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')
        const archivo = path.resolve(`api/${nombre}.js`)
        res.setHeader('Content-Type', 'application/json')
        if (!/^[a-z]+$/.test(nombre) || !fs.existsSync(archivo)) {
          res.statusCode = 404
          return res.end(JSON.stringify({ error: `No existe /api/${nombre}` }))
        }
        try {
          let cuerpo = ''
          for await (const chunk of req) cuerpo += chunk
          const vreq = {
            method: req.method,
            headers: req.headers,
            query: Object.fromEntries(url.searchParams),
            body: cuerpo ? JSON.parse(cuerpo) : undefined,
          }
          const vres = {
            status(codigo) { res.statusCode = codigo; return this },
            json(obj) { res.end(JSON.stringify(obj)) },
          }
          const mod = await import(pathToFileURL(archivo).href)
          await mod.default(vreq, vres)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiLocal()],
})
