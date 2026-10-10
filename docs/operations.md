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
                                                                                          └─ /api/diet/assistant ─► ollama (Gemma 4), solr `foods` core
                                                                                                                    (SerpApi/Google only if SERPAPI_API_KEY is set)
```

| Service (compose name) | Container | What it is |
|---|---|---|
| `nginx` | `progressx-nginx` | Entry point on port 80. Rate limits, upload size cap, proxies to the app and the Solr ingest route (`nginx/default.conf.template`). |
| `progressx` | `progressx-app` | The Next.js app: pages and every `/api` route (`progressx/`). |
| `search_backend` | `progressx-search-backend` | FastAPI service that queries Solr for research articles (`data/search_backend/`). |
| `redis` | `progressx-redis` | Cache for search results. Memory only (256 MB, nothing saved to disk); safe to restart or flush. |
| `solr` | `progressx-solr` | Search index of research articles, plus the `foods` core (nutrition database for the diet assistant). Data lives on disk in `data/db/var/solr`, so it survives rebuilds. |
| `ollama` | `progressx-ollama` | Local LLM (Gemma 4) behind the diet assistant in Quick Add. On first start it downloads `OLLAMA_MODEL` into the `ollama` Docker volume (a few GB, takes a few minutes); later starts reuse it. |

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
| `OLLAMA_PORT` | `11435` | Port the Ollama container is published on, on `127.0.0.1` (not 11434, which a Mac copy of Ollama would use). |
| `FRONTEND_URL` | `http://progressx:8080` | How nginx reaches the app (compose service name + `FRONTEND_PORT`). |
| `SEARCH_BACKEND_URL` | `http://search_backend:8000` | How the app reaches the search service. Overrides the value in `progressx/.env.local`. |
| `SOLR_URL` | `http://solr:8983/solr/` | How the search service reaches Solr (passed to it as `solr_local_url`). |
| `SOLR_ORIGIN` | `http://solr:8983` | Solr host for nginx's `/solr-ingest/` route (no `/solr` path). |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection for the search cache. Leave empty to run search without a cache. |
| `FOODS_SOLR_URL` | `http://solr:8983/solr/foods` | The nutrition database the diet assistant searches. Overrides the value in `progressx/.env.local`. |
| `OLLAMA_URL` | `http://ollama:11434` | How the app reaches Ollama. Overrides the value in `progressx/.env.local`. To use the Ollama app on the Mac instead (it can use the GPU, so it's much faster), set `http://host.docker.internal:11434`. |
| `OLLAMA_MODEL` | `gemma4:e2b` | Model the diet assistant uses. It must fit in Docker's memory (Docker Desktop > Settings > Resources, 8 GB by default): `gemma4:e2b` needs about 5 GB, `gemma4:e4b` about 7-10 GB (raise Docker's memory to 12 GB+ first). After changing it, `docker compose up -d ollama progressx` downloads and switches to it. |
| `OLLAMA_KEEP_ALIVE` | `30m` | How long the model stays in memory after the last chat. The first message after that takes ~10 s longer while it loads. |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | The model's context window in tokens. Bigger uses more memory. |
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
| `OLLAMA_URL`, `OLLAMA_MODEL`, `FOODS_SOLR_URL` | No | Diet assistant model and food database, for `npm run dev` (`http://localhost:11435`, `gemma4:e2b`, `http://localhost:8983/solr/foods`). Docker Compose overrides them from the root `.env`. | n/a |
| `R2_ACCOUNT_ID` | No | Cloudflare account that holds the video bucket (R2's S3 endpoint is `https://<id>.r2.cloudflarestorage.com`). Empty = video uploads are off (the feed still loads). | Cloudflare dashboard > R2 > Overview (Account ID) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | **Yes** | Keys of an R2 API token with **Object Read & Write** on the video bucket only. Signs upload and playback links, checks uploads, deletes videos (including on account deletion). | R2 > Manage API tokens > Create API token |
| `R2_VIDEO_BUCKET` | No | The bucket's name (default `progressx-videos`). | n/a |
| `SERPAPI_API_KEY` | Yes | Optional. Leave empty normally. If set, the assistant can also read Google's AI Overview (through SerpApi) for foods the database doesn't have, like restaurant items; each uncached lookup uses one search from the plan's quota. Add SerpApi to the privacy policy first (see docs/privacy/README.md). | serpapi.com > Dashboard > API Key |

Set automatically, not in any file:

- `NODE_ENV`: `production` in Docker (turns on `Secure` cookies, so logins need HTTPS), `development` under `npm run dev`.
- `PORT`: set from `FRONTEND_PORT` by Docker Compose.

### 3. Search backend and ingestion (`data/.env`)

Used by `data/search_backend` and `data/DAGs` when run outside Docker. In Docker, compose sets them.

| Variable | Meaning |
|---|---|
| `python_backend_env` | `local` uses `solr_local_url`; `prod` uses `solr_prod_url`. |
| `solr_local_url` | Solr address for local runs, e.g. `http://localhost:8983/solr/`. |
| `solr_prod_url` | Production Solr through nginx, with the ingest password: `https://github-actions:<password>@progressx.ca/solr-ingest/`. The ETL workflow reads it from Vault (`secret/progressx/NginxFileConfig`, key `solr-ingest-url.txt`). |
| `REDIS_URL`, `SEARCH_CACHE_TTL_SECONDS`, `DOC_CACHE_TTL_SECONDS` | Same as above. |

### Other secret files (gitignored)

- `nginx/solr-ingest.htpasswd`: password for the `/solr-ingest/` route.
- `nginx/solr-ingest-url.txt`: the full ingest URL including that password. Its copy in Vault (`secret/progressx/NginxFileConfig`) is what the ETL workflow uses; update both if the password changes.

### Login settings (in code, not env vars)

Set in `progressx/src/app/api/libs/session.ts`; change them, then rebuild the app.

| Constant | Value | Meaning |
|---|---|---|
| `SESSION_MAX_AGE_SECONDS` | 5 hours | How long a login lasts, counted from when the person logged in, however active they are. |
| `IDLE_TIMEOUT_SECONDS` | 15 minutes | Logged out after this long without using the app. Keep `IDLE_TIMEOUT_MS` in `internal_components/SessionWatch.tsx` the same. |

## Food database (diet assistant)

The assistant in Quick Add looks foods up in the `foods` Solr core: about 19,000 foods from USDA
FoodData Central (FNDDS survey foods, SR Legacy, Foundation; public domain) and Health Canada's
Canadian Nutrient File (Open Government Licence - Canada, which requires the attribution shown in the
chat). Each food stores its nutrients per 100 g and its portion sizes in grams.

Build or rebuild it (needs the solr container running; takes a few seconds, downloads ~20 MB to
`data/foods/raw/` the first time):

```bash
python3 data/foods/ingest_foods.py
```

**Links:** if a user pastes a link (a recipe, menu item or product page), the assistant can read it
(`progressx/src/app/api/libs/foodPage.ts`). It only opens links the user wrote, never ones the model
makes up; it refuses anything that resolves to a private or internal address (so it can't reach Solr,
Redis, Ollama or this Mac), checked again on every redirect; and it gives up after 10 s or 2 MB. The
page's schema.org nutrition data is used when present (most recipe sites), otherwise the text around
the nutrition facts. Many restaurant sites block automated reading or build their pages with
JavaScript, so those links often can't be read; the assistant then offers the database instead.
Sites whose pages load nutrition from their own public data URL get a small adapter in `foodPage.ts`
(`ADAPTERS`) that reads that URL directly - currently Starbucks (`starbucks.com` / `starbucks.ca`
`/menu/product/<id>/<form>` -> `/apiproxy/v1/ordering/<id>/<form>`, every size's full nutrition panel; the
size the user names is picked in code). If a site changes its data URL the adapter falls back to reading
the page normally.

**Label photos:** users can send a photo of a nutrition label (camera button in the chat). The browser
shrinks it to 1600 px and re-encodes it as a JPEG; the server then refuses anything over 6 MB per
request / 4 MB per photo, checks the real format from the file's bytes (JPEG, PNG or WebP only - SVG and
anything else that can carry scripts is refused), and re-encodes it from its pixels with sharp
(`cleanImage` in `api/libs/imageUpload.ts`, the same check as progress photos) before Gemma reads it.
Photos are never stored, and are limited to 10 per user per 15 minutes. The first photo after the model
has been idle takes about a minute (the vision part loads); later ones take ~25 s.

Re-run it after changing `data/foods/ingest_foods.py` or to pick up a newer USDA release (update the
file names in `DATASETS`). It replaces the core's contents; no app restart needed.

## Search engines and Google sign-in branding

The site has one public address, `https://progressx.ca`. nginx permanently redirects `http://` and
`www.` requests there (using the `CF-Visitor` header Cloudflare adds), every public page declares it
as its canonical address (`metadataBase` in `src/app/layout.tsx`, `SITE_URL` in `src/app/siteUrl.ts`),
and `/sitemap.xml` and `/robots.txt` list the public pages (home, login, terms, privacy). Google's
OAuth branding check needs the home page reachable without logging in and linking to the privacy
policy, which it does; if it ever reports the home page as unresponsive, check the tunnel was up at
that time and request re-verification.

## Videos (Cloudflare R2)

Videos (the For You feed, the Videos / Liked / Favourites tabs, other people's profiles) are files in a
private R2 bucket; the database (`videos`, `video_likes`, `video_favourites`) holds who posted what,
captions, and the like / favourite counts (kept in step by triggers).

- **Uploads** go straight from the browser to R2 with a one-time signed `PUT` link from
  `/api/videos/upload` (the file's exact size and type are part of the signature), so video files never
  pass through this Mac or the tunnel. `/api/videos/:id/complete` then reads the uploaded file's
  structure from R2 (ranged reads) and only posts it if it really is an MP4 / MOV within the limits,
  otherwise deletes it. Limits: MP4 / MOV, 200 MB, 3 minutes (`internal_components/videos/videoTypes.ts`).
  Per user: 10 uploads an hour, 3 unfinished at a time; unfinished uploads are cleared after 2 hours.
- **Thumbnails**: the uploader's browser captures a frame, the server re-encodes it with sharp and stores
  it next to the video (`videos/<user id>/<video id>.jpg`).
- **No transcoding**: videos play exactly as uploaded. H.264 MP4 plays everywhere; HEVC (iPhone's
  "High Efficiency" setting) plays in Safari and in Chrome / Edge on hardware that decodes HEVC, but not
  in Firefox. There's one quality, so large files start slower on weak connections.
- **Playback** uses signed `GET` links valid for up to 3 hours, handed out only to people allowed to see
  the video: the poster, or anyone if the poster's profile is **public**. Making a profile private hides
  its videos from the feed, its profile page and everyone else's Liked / Favourites lists straight away
  (links already handed out keep working until they expire).
- **Liked and Favourites** lists are only ever shown to their owner.
- **Deleting** a video removes its file and thumbnail from R2 first, then the database. Account deletion
  deletes everything under `videos/<user id>/` in the bucket before anything else.
- **Cloudflare's terms**: videos are served from R2's own storage address, never through progressx.ca or
  the tunnel (serving video through the proxy on a Free / Pro / Business plan isn't allowed). Don't put
  the bucket behind a custom domain on the progressx.ca zone. Cloudflare's own recommendation for video
  is Stream; R2 was chosen for cost.

Set up (once):

1. Cloudflare dashboard > R2: enable R2 (asks for a payment method; 10 GB storage free each month, no
   charge for downloads).
2. Create the bucket `progressx-videos` (private; no public access, no custom domain). The Cloudflare
   Developer Platform connector can do this, or the dashboard.
3. R2 > Manage API tokens > Create API token: **Object Read & Write**, limited to that bucket. Put the
   Access Key ID, Secret Access Key and your Account ID in `progressx/.env.local`.
4. Let the site upload to the bucket (CORS), then rebuild the app:
   ```bash
   cd progressx && node --env-file=.env.local scripts/r2-setup.mjs
   ```

## ID verification (government ID)

Posting videos, likes, favourites and follows need a verified ID (`api/libs/requireVerified.ts`);
browsing and private tracking don't. Users verify in Settings > Identity verification with a passport
(photo page) or a driver's licence / provincial ID card (front and back).

**Automated review** (`api/libs/idVerification.ts`, all on this Mac, nothing sent to another company):
- Passport: the local model reads the machine-readable zone, which must pass every ICAO 9303 check digit
  (`api/libs/idDocuments.ts`). A random image or an edited digit fails.
- Licence / ID card: the PDF417 barcode on the back is decoded (zxing-wasm, from the installed package)
  and must be a valid AAMVA record; the front's printed birth or expiry date must match it.
- Then: not expired, 18+, within a year of the profile's age, and the document (keyed hash of its number)
  isn't already verifying another account.
- It can't detect a convincing forgery or someone else's real ID (that needs a live selfie matched to
  the ID photo, i.e. a verification provider).

**Storage** (`api/libs/idVault.ts`): envelope encryption.
- Each verification gets a random 256-bit data key; each photo is encrypted with AES-256-GCM (user id
  and file slot bound in, so files can't be swapped or altered) and stored in the private R2 bucket
  `progressx-ids`, under `ids/<user id>/`.
- The data key is encrypted with the master key `ID_ENCRYPTION_KEY` and stored in `id_verifications`
  (server-only table: row level security with no policies and no grants for the public roles).
- Reading an ID needs the database, the ID bucket's token **and** the master key. There is no web route
  that decrypts or returns one. Rejected photos are never stored. No name, birth date or document number
  is stored readable; `fingerprint` is an HMAC (`ID_FINGERPRINT_KEY`) of the document number.
- "Remove" in Settings and account deletion delete the files first (account deletion stops if that fails).

**Keys** (in `progressx/.env.local`, file mode 600):
- `ID_ENCRYPTION_KEY`, `ID_FINGERPRINT_KEY`: 32 random bytes, base64. Back them up in a password manager
  **separately** from database backups. Losing `ID_ENCRYPTION_KEY` makes every stored ID unreadable (users
  would just verify again); leaking it together with the database and bucket exposes them.
- Rotation: put the old key in `ID_ENCRYPTION_KEY_V<n>` (n = its version), set a new `ID_ENCRYPTION_KEY`
  and bump `ID_ENCRYPTION_KEY_VERSION`; new verifications use the new key, old ones still open.
- `R2_ID_ACCESS_KEY_ID`, `R2_ID_SECRET_ACCESS_KEY`: a separate R2 Account API token with **Object Read &
  Write on `progressx-ids` only** (the video token can't reach this bucket, and this one can't reach
  videos). Don't give the bucket public access, a custom domain or CORS rules: only the server uses it.

**Reading one back** (a legal / privacy request, fraud investigation), on this Mac only:
```bash
cd progressx && node --env-file=.env.local scripts/id-decrypt.mjs <user id> <output folder>
```
Look, then delete the output (`rm -P`). Never email or upload it; note the access in the privacy request log.

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
