# ashwinkren.com

Personal site with **ScrollMap** — live consumption analytics powered by the Reel Mirror Chrome extension.

## Quick start

```bash
npm install
cd site && npm install && cd ..
npm run dev
```

- Site: http://localhost:5173
- ScrollMap: http://localhost:5173/scrollmap
- Sync API: http://localhost:8787/api/sync/:syncId

## Features

- **Overview** — reels, watch time, satisfaction, category breakdown
- **Consumption** — compulsion vs intention, brainrot share, recent reels
- **Focus** — Pomodoro timer with pre-scroll difficulty suggestions
- **Recommendations** — satisfaction-aligned, not engagement-maximized
- **Wellness** — weekly digital wellness score + mood logging
- **Parenting** — anonymous category mix and behavioral alerts
- **Creator Research** — panel satisfaction signals for creators

## Live sync

1. Open ScrollMap and copy your **Sync ID**
2. In Reel Mirror extension popup, paste the Sync ID and click **Sync to ScrollMap**
3. Dashboard polls every 15s for updates

Or import a JSON export from the extension manually.

## Deploy

Build the site and deploy `site/dist` to Vercel/Netlify for `ashwinkren.com`. Run the sync server on Railway/Fly.io and set `VITE_API_URL` or proxy `/api` to your server.

```bash
npm run build
```

## Domain

Point `ashwinkren.com` DNS to your static host. For API sync in production, deploy `server/` separately and configure reverse proxy on `/api/*`.
