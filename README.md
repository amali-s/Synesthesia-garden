# Synesthesia Garden

A pixel-art meadow that grows from sound: your **voice** through the microphone (Speaker), or **music already playing on your device** (Music). Pitch, loudness, timbre, and rhythm become the kind, hue, size, and motion of the flowers.

Plan and acceptance criteria live in [`ROADMAP.md`](./ROADMAP.md); what is actually shipped is tracked in [`project-state.md`](./project-state.md).

## The loop

1. Pick **Speaker** or **Music** in the top bar.
2. Press **Listen** (or the **L** key). The same button reads **Stop** while capturing.
3. Sing, talk, or play something. Pitched sound plants flowers across eight timber beds — low and left in front, high and right at the back. Quiet gaps sprout grass. Drums pulse the bed instead of planting.
4. **Hover** a flower (or tap it on touch) to hear its pitch chime and see its kind, Hz, and note in the mapping card.
5. **Stop**, then **Forage** (**K**). A fox harvests the fullest beds and mails a small bouquet PNG. **Clear garden** (**C**) empties the beds, with an Undo for a few seconds.

The pitch meter shows live Hz plus the equal-temperament note from A440. The card in the bottom-right corner is the legend: a 2×4 bed compass driven by the same math as planting.

Speaker listens 80–1000 Hz; Music widens the window to 50–4000 Hz so bass and high instruments are not all clamped to one bed.

## Music mode limits

Music uses `getDisplayMedia`, so it inherits the browser's rules — the honest version:

- **Chrome or Edge**, sharing a **tab or window** with **“Share audio”** ticked, is the reliable path.
- **Safari** refuses tab/system audio capture; the app says so and leaves Speaker working.
- Firefox and some OS combinations offer a share with no audio track. The status line tells you when that happens.
- Captured audio is **not** played back through the garden, so you never hear it twice.
- There is **no file upload**. Play the file in another tab and share that tab.

Speaker and Music never run at the same time; switching modes while listening restarts capture.

Streaming links (Spotify, Qobuz) are **hidden** — the code is still in the tree but nothing in the UI reaches it, and **Listen needs no secrets or `.env` file**.

## Develop

```bash
npm install
npm run dev
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm test` | Vitest suite (pitch mapping, garden ingest, URL parsers) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc` over `src` (browser) and `api` + Vite config (Node) |
| `npm run build` | Typecheck both configs, then production build |
| `npm run preview` | Serve the production build |

Two TypeScript configs on purpose: `tsconfig.json` covers the browser code in `src`, `tsconfig.node.json` covers the Vercel functions in `api/`, the Vite config, and the deferred dev middleware. `npm run build` runs both.

## Deploy

Both targets work; only the base path differs.

- **GitHub Pages** — assets are served under `/Synesthesia-garden/` (the default `base` in `vite.config.ts`).
- **Vercel** — the `VERCEL` environment variable flips `base` to `/`.

No API secrets are required for either.
