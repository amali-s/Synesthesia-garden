import { defineConfig, loadEnv } from 'vite'
import { spotifyApiPlugin } from './vite-plugin-spotify-api'
import { qobuzApiPlugin } from './vite-plugin-qobuz-api'

// GitHub Pages serves under /Synesthesia-garden/; Vercel uses root.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    base: process.env.VERCEL ? '/' : '/Synesthesia-garden/',
    // Spotify is active now; Qobuz middleware stays for later.
    plugins: [spotifyApiPlugin(), qobuzApiPlugin()],
  }
})
