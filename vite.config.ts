import { defineConfig, loadEnv } from 'vite'

// GitHub Pages serves under /Synesthesia-garden/; Vercel uses root.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    base: process.env.VERCEL ? '/' : '/Synesthesia-garden/',
    // Spotify and Qobuz are deferred (see ROADMAP "Later"), so their dev
    // middleware stays unregistered while the UI is hidden. The plugins live in
    // `vite-plugin-spotify-api.ts` / `vite-plugin-qobuz-api.ts` if we bring the
    // streaming UI back. Play needs no secrets.
    plugins: [],
  }
})
