# Deployment Plan — Neuro

Two environments, fully separate data:

- **Local** (your machine): frontend `:3001`, backend `:8001`, local `backend/neuro.db`. Your
  fearless testing playground — break things freely. No password (auth is off).
- **Prod** (deployed): Frontend on **Vercel**, backend + SQLite on **Fly.io** with a persistent
  volume. Its own database; local work never touches it. Password-gated.

Workflow: develop & test locally → `git push` → Vercel auto-deploys the frontend, `fly deploy`
ships the backend. The app's additive startup migrations keep prod data intact across releases.

## Repo structure (monorepo)

```
learning_app_v3/
  frontend/   → Next.js app (Vercel builds from here)
  backend/    → FastAPI app + Dockerfile (Fly builds from here)
  DEPLOYMENT.md, WISHLIST.md, ...
```

One git repo. Vercel "Root Directory" = `frontend`. Fly app lives in `backend/` (run
`fly` commands from there, or set the build context). (GitHub repo setup is a later step.)

## Architecture

```
Your devices ──► Vercel (Next.js)  ──HTTPS──►  Fly.io (FastAPI)
                 password login                 /data/neuro.db  (Fly volume)
                 NEXT_PUBLIC_API_BASE
```

- **Fly volume**: a persistent SSD mounted at `/data`. Survives deploys/restarts. The DB lives
  at `/data/neuro.db`. (One machine, one region — correct for a single-user app.)
- No Litestream / external backups — this is replaceable learning data, not critical state.

## Prod-safety code changes — DONE (all no-op locally, verified)

1. ✅ **Configurable DB path** — `db.py` reads `NEURO_DB_PATH` (prod = `/data/neuro.db`),
   defaults to local `backend/neuro.db`.
2. ✅ **Configurable CORS** — `main.py` reads `FRONTEND_ORIGINS` (comma-separated), defaults to
   `localhost:3001`.
3. ✅ **Password auth** — `_AuthMiddleware` requires `Authorization: Bearer <APP_PASSWORD>` on
   every route except `/health`, but ONLY when `APP_PASSWORD` is set (so local is open).
   Frontend: `/login` page stores the password as a token (`lib/auth.ts`), `api.ts` attaches it
   to every request and bounces to `/login` on 401.
4. ✅ **Destructive migration guarded** — `db.py` `_premigrate` only drops the note table when
   `NEURO_ALLOW_DESTRUCTIVE=1`, so a deploy can never wipe real notes.

## Prod environment variables

Backend (Fly secrets):
- `OPENAI_API_KEY` — real key (rotate the temporary local one).
- `APP_PASSWORD` — the login password.
- `NEURO_DB_PATH=/data/neuro.db`
- `FRONTEND_ORIGINS=https://<your-app>.vercel.app`
- `MODEL=gpt-5.4`, `USER_NAME=Rahul` (if not defaulting)

Frontend (Vercel env):
- `NEXT_PUBLIC_API_BASE=https://<app>.fly.dev`

## Still TODO before first deploy

- Add `backend/Dockerfile` (python:3.12-slim, install `requirements.txt`, run uvicorn on 8001).
- `fly launch` (no deploy) in `backend/` → `fly.toml`; pick a region near you (e.g. `iad`/`yyz`).
- `fly volumes create neuro_data --size 1 --region <region>`; mount at `/data` in `fly.toml`.
- `fly secrets set ...` (the backend vars above); `fly deploy`.
- Vercel: import repo, Root Directory = `frontend`, set `NEXT_PUBLIC_API_BASE`; deploy.
- Add the Vercel URL to `FRONTEND_ORIGINS` and redeploy backend.
- Phone: open the Vercel URL → Add to Home Screen (PWA metadata already present).

## Costs

- Fly machine (shared-cpu-1x) + 1 GB volume: ~$3-5/mo. Vercel Hobby: free. OpenAI usage
  (gpt-5.4 + web search): the real cost, modest for personal daily use but metered.
