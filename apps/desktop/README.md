# PrintFlow Shop (Desktop)

Electron client for the print shop. Receives **paid** jobs from the PrintFlow backend, previews the final PDF, prints it on a Windows printer, and advances order status. It never touches Supabase directly — all access is through the token-authed shop API.

## Architecture

```
Electron (main.cjs)  ──HTTPS + Bearer token──▶  Next.js  /api/shop/*  ──▶  Supabase
        │                                            ▲
   pdf-to-printer (SumatraPDF)                        │
        │                                     verified shop token (HS256)
   Windows printer
```

- **main.cjs** — window, config store (`userData/printflow-config.json`), API client, printer detection + printing (`pdf-to-printer`), test-page generation (`pdf-lib`).
- **preload.cjs** — minimal `window.printflow` IPC bridge (context isolation on, no Node in renderer).
- **renderer/** — vanilla JS UI (login, printer picker + health, order board, actions).

## Run (dev)

```bash
# from repo root
npm install                       # installs electron + pdf-to-printer for this app
npm run dev --workspace=apps/desktop
```

1. Start the web app (`npm run dev` at root) so `/api/shop/*` is reachable.
2. In the desktop app, set Server URL (default `http://localhost:3000`) and sign in
   with a **shop owner** account.
3. Pick a printer, print a test page, then process orders.

## Build the Windows installer

```bash
npm run build --workspace=apps/desktop   # electron-builder → apps/desktop/release/*.exe (NSIS)
```

## Notes

- Printing uses `pdf-to-printer`, which bundles SumatraPDF and is **Windows-only**.
  On macOS/Linux the app runs but printing is disabled (for development).
- Copies are applied at print time from the job metadata; the final PDF stores a
  single copy (the content source of truth).
- The queue polls every 15s; Supabase Realtime can replace polling later.
