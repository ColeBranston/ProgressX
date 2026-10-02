# Running ProgressX

How the production stack fits together, what every environment variable means, and the Docker
Compose commands to start, restart and rebuild it. Run every `docker compose` command from the
repo root (the folder with `docker-compose.yml`).

## What runs where

```
browser ──► Cloudflare ──► cloudflared tunnel (on this Mac) ──► nginx :80
                                                                  ├─ /api/search/  ─► progressx (Next.js) ─► search_backend (FastAPI) ─► solr
                                                                  │                                                     └─► redis (cache)
                                                                  ├─ /solr-ingest/ ─► solr   (GitHub Actions ingestion, password protected)
                                                                  └─ everything else ─► progressx (Next.js) ─► Supabase, Cloudinary
```

| Service (compose name) | Container | What it is |
|---|---|---|
| `nginx` | `progressx-nginx` | Entry point on port 80. Rate limits, upload size cap, proxies to the app and the Solr ingest route (`nginx/default.conf.template`). |
| `progressx` | `progressx-app` | The Next.js app: pages and every `/api` route (`progressx/`). |
| `search_backend` | `progressx-search-backend` | FastAPI service that queries Solr for research articles (`data/search_backend/`). |
| `redis` | `progressx-redis` | Cache for search results. Memory only (256 MB, nothing saved to disk); safe to restart or flush. |
| `solr` | `progressx-solr` | Search index of research articles. Data lives on disk in `data/db/var/solr`, so it survives rebuilds. |

**Not in Docker Compose:**

- **cloudflared** (the Cloudflare tunnel that makes progressx.ca reach this Mac) runs as a macOS system
  service (`/Library/LaunchDaemons/com.cloudflare.cloudflared.plist`) and starts on boot. Its token
  lives in that plist, not in this repo. If the site is unreachable but `curl -I http://localhost` works,
  check the tunnel:
  ```bash
  sudo launchctl kickstart -k system/com.cloudflare.cloudflared
  ```
- **Supabase** (database + logins) and **Cloudinary** (photos) are hosted services, configured
  through `progressx/.env.local`.
- **Article ingestion** runs on GitHub Actions (`.github/workflows/schedule.yml`) and writes to Solr
  through nginx's `/solr-ingest/` route (see `data/DAGs/readme.md`).

## Environment variables

There are two env files, both gitignored. Never commit them. Copy the matching `.env.sample` to start.

### 1. `.env` (repo root): Docker Compose settings

Docker Compose reads this automatically and fills in the `${...}` values in `docker-compose.yml`.
None of these are secret.

| Variable | Production value | Meaning |
|---|---|---|
| `NGINX_PORT` | `80` | Port nginx listens on, on this Mac. The Cloudflare tunnel points here. |
| `FRONTEND_PORT` | `8080` | Port the Next.js app listens on inside its container (also published on `127.0.0.1` for debugging). |
| `SEARCH_BACKEND_PORT` | `8000` | Port the FastAPI search service listens on. |
| `SOLR_PORT` | `8983` | Port Solr listens on. |
| `REDIS_PORT` | `6379` | Port Redis listens on. |
| `FRONTEND_URL` | `http://progressx:8080` | How nginx reaches the app (compose service name + `FRONTEND_PORT`). |
| `SEARCH_BACKEND_URL` | `http://search_backend:8000` | How the app reaches the search service. Overrides the value in `progressx/.env.local`. |
| `SOLR_URL` | `http://solr:8983/solr/` | How the search service reaches Solr (passed to it as `solr_local_url`). |
| `SOLR_ORIGIN` | `http://solr:8983` | Solr host for nginx's `/solr-ingest/` route (no `/solr` path). |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection for the search cache. Leave empty to run search without a cache. |
| `APP_URL` | `https://progressx.ca` | Public address of the site. Google sign-in sends people back to `APP_URL/login`, so it must match an allowed redirect URL in Supabase (Authentication > URL Configuration). |
| `SEARCH_CACHE_TTL_SECONDS` | `3600` | How long a search result stays cached (1 hour). |
| `DOC_CACHE_TTL_SECONDS` | `86400` | How long a single article stays cached (1 day). |

Values containing a service name (`progressx`, `solr`, `redis`, `search_backend`) only work inside
the compose network. When running something outside Docker, use `localhost` and the port instead.

### 2. `progressx/.env.local`: app secrets

Loaded into the app container by `env_file:` in `docker-compose.yml`, and read by `npm run dev`
during local development. **These are secrets**, and anyone holding them has full access to user data.
To rotate one, change it in the provider's dashboard, update this file, then rebuild the app (see below).

| Variable | Secret? | Meaning | Where to find it |
|---|---|---|---|
| `SUPABASE_URL` | No | The Supabase project's address (`https://<project>.supabase.co`). Also used to check login tokens' issuer. | Supabase > Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes, most sensitive** | Server-side admin key: bypasses row-level security, creates and deletes users. Only ever used on the server. | Supabase > Project Settings > API > `service_role` |
| `SUPABASE_JWT_SECRET` | **Yes** | Used to verify that login tokens really came from Supabase. If it leaks, someone could forge a login as any user. | Supabase > Project Settings > API > JWT Settings |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary account name used in image URLs. | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key for uploads and deletes. | Cloudinary > Settings > API Keys |
| `CLOUDINARY_API_SECRET` | **Yes** | Signs Cloudinary uploads and deletes. | Cloudinary > Settings > API Keys |
| `SEARCH_BACKEND_URL` | No | Where `/api/search` sends queries. Local dev: `http://localhost:8000`. Docker Compose overrides it. | n/a |
| `APP_URL` | No | Public address of the site. Local dev: `http://localhost:3001`. Docker Compose overrides it. | n/a |

Set automatically, not in any file:

- `NODE_ENV`: `production` in Docker (turns on `Secure` cookies, so logins need HTTPS), `development` under `npm run dev`.
- `PORT`: set from `FRONTEND_PORT` by Docker Compose.

### 3. Search backend and ingestion (`data/.env`)

Used by `data/search_backend` and `data/DAGs` when run outside Docker. In Docker, compose sets them.

| Variable | Meaning |
|---|---|
| `python_backend_env` | `local` uses `solr_local_url`; `prod` uses `solr_prod_url`. |
| `solr_local_url` | Solr address for local runs, e.g. `http://localhost:8983/solr/`. |
| `solr_prod_url` | Production Solr through nginx, with the ingest password: `https://github-actions:<password>@progressx.ca/solr-ingest/`. On GitHub it's the `SOLR_PROD_URL` secret. |
| `REDIS_URL`, `SEARCH_CACHE_TTL_SECONDS`, `DOC_CACHE_TTL_SECONDS` | Same as above. |

### Other secret files (gitignored)

- `nginx/solr-ingest.htpasswd`: password for the `/solr-ingest/` route.
- `nginx/solr-ingest-url.txt`: the full ingest URL including that password, for `gh secret set SOLR_PROD_URL`.

### Login settings (in code, not env vars)

Set in `progressx/src/app/api/libs/session.ts`; change them, then rebuild the app.

| Constant | Value | Meaning |
|---|---|---|
| `SESSION_MAX_AGE_SECONDS` | 5 hours | How long a login lasts, counted from when the person logged in, however active they are. |
| `IDLE_TIMEOUT_SECONDS` | 15 minutes | Logged out after this long without using the app. Keep `IDLE_TIMEOUT_MS` in `internal_components/SessionWatch.tsx` the same. |

## Docker Compose commands

### Start everything

```bash
docker compose up -d
```

`-d` runs it in the background. Containers have `restart: unless-stopped`, so they come back by
themselves after a crash or a reboot (once Docker Desktop starts), unless you stopped them yourself.

### See what's running and read logs

```bash
docker compose ps
```

```bash
docker compose logs -f progressx
```

Swap `progressx` for any service name. Use `--tail 100` to see only the last 100 lines.

### Restart (no code changes)

Restarts the running containers as they are. Use this after a hang, or after editing
`nginx/default.conf.template`, which is read at startup.

```bash
docker compose restart progressx
```

```bash
docker compose restart
```

`restart` does **not** pick up code changes, Dockerfile changes or env file changes. Use the commands below for those.

### Rebuild after a code change (the usual deploy)

Builds a new image from the current code and swaps the container. The site is briefly unavailable
(a few seconds) while the new container starts.

```bash
docker compose up -d --build progressx
```

Use the service you changed: `progressx` for the app, `search_backend` for the search service,
`solr` for the Solr image. The app build takes a few minutes and runs `next build`, so type errors
fail the build and the old container keeps running.

### Apply env file changes

Changing `.env` or `progressx/.env.local` needs the container recreated (a plain `restart` keeps the
old values):

```bash
docker compose up -d --force-recreate progressx
```

The app reads its env at runtime, so a rebuild isn't needed for env-only changes.

### Rebuild everything

```bash
docker compose up -d --build
```

Add `--no-cache` to `docker compose build` if a build seems to be using stale files:

```bash
docker compose build --no-cache progressx
```

### Stop

```bash
docker compose stop
```

Stops the containers but keeps them, so `docker compose up -d` brings them back quickly.

```bash
docker compose down
```

Stops and removes the containers and their network. Solr's data is safe (it's in `data/db/var/solr`
on disk). Redis's cache is emptied, which is harmless. **Never add `-v`**: it would delete volumes.

### Run a command inside a container

```bash
docker compose exec redis redis-cli FLUSHDB
```

That example clears the search cache, e.g. after a big ingestion run.

### Free disk space from old builds

Each rebuild leaves the previous image behind.

```bash
docker image prune -f
```

## Local development (without Docker)

```bash
npm --prefix progressx install
```

```bash
npm --prefix progressx run dev -- -p 3001
```

The app runs at http://localhost:3001 using `progressx/.env.local` (with the local
`SEARCH_BACKEND_URL` and `APP_URL`). It talks to the **real** Supabase project and Cloudinary, so test
with throwaway accounts and delete them afterwards. For search to work locally, the search backend
and Solr need to be running too, e.g. `docker compose up -d search_backend`.

Run these before deploying:

```bash
npx --prefix progressx tsc --noEmit -p progressx
```

```bash
npm --prefix progressx run lint
```

## After a reboot or outage: checklist

1. Docker Desktop is running, then `docker compose ps` shows all five services `Up`.
2. `curl -I http://localhost` returns a response from nginx.
3. https://progressx.ca loads. If not, but step 2 works, restart the tunnel (see *What runs where*).
4. If `docker compose ps` shows a service restarting over and over, run `docker compose logs <service>`.
