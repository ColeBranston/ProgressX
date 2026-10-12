# Media Worker (media.progressx.ca)

Serves the videos and thumbnails in the private `progressx-videos` R2 bucket through Cloudflare's cache.
The bucket itself stays private (no public access, no custom domain on it); the Worker reads it through
the `VIDEOS` binding (`wrangler.jsonc`).

- **Access**: every request needs a link the app signed (`mediaUrl` in
  `progressx/src/app/api/libs/r2Videos.ts`): `/<object key>?exp=<unix seconds>&sig=<HMAC-SHA256 of
  "<key>\n<exp>" with MEDIA_SIGNING_KEY, base64url>`. Links are signed for the current hour and last
  2-3 hours, so a private profile's videos or a deleted video stop being reachable once the links the
  app already handed out expire. Only `videos/<user>/<video>.(mp4|mov|jpg)` can be served; the ID
  images live in another bucket the Worker has no binding to.
- **Caching**: the signature is checked on every request, then the file comes from the cache of the
  Cloudflare data centre serving the viewer, keyed on the object only (all links to a video share one
  copy) and kept for a day. Seeking (`Range`) is answered from that copy. On a miss the viewer is
  answered straight from R2 while the whole file is copied into the cache in the background.
- **Terms**: Cloudflare allows video through its CDN when a Cloudflare service (here R2) hosts it
  ([updated terms, 2023](https://blog.cloudflare.com/updated-tos/)). Video must never be served from
  the Mac mini through the tunnel.
- **Cost**: Workers Free covers 100,000 requests a day (each request, including every seek, counts);
  Workers Paid is $5/month for 10 million. R2 reads on cache misses count towards R2's 10 million free
  reads a month; downloads are free.

## Deploying

CI deploys it on every push to `main` (`.github/workflows/ci.yml`, "Deploy media Worker", before the
app), and sets its `MEDIA_SIGNING_KEY` secret from Vault (`secret/progressx/AppEnvLocal`). It needs a
Cloudflare API token in Vault:

1. Cloudflare dashboard > My Profile > API Tokens > Create Token > "Edit Cloudflare Workers" template.
   Account resources: your account. Zone resources: `progressx.ca` only.
2. On the Mac mini, run `bash ~/server-data/vault/scripts/set-cloudflare-token.sh` and paste the token
   (not echoed). It saves `secret/progressx/actions-secrets/Cloudflare` with `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` (copied from `R2_ACCOUNT_ID`) and checks the token with Cloudflare.
3. Push to `main` (or re-run the Deploy job). Check: a link from the app
   (`curl -I "<video src>"`) answers `200`, and an unsigned one `403`.
4. Switch the app over: add `MEDIA_BASE_URL=https://media.progressx.ca` to
   `secret/progressx/AppEnvLocal` and redeploy. Remove it to go back to plain R2 links.

By hand, from this folder: `CLOUDFLARE_API_TOKEN=... npx wrangler@4.141.0 deploy`.

## Testing

- Unit tests (with links signed by the app's own code): `progressx/tests/unit/lib/mediaWorker.test.ts`,
  part of `npm run test:unit`.
- In the real Workers runtime, with a local bucket and cache: put `MEDIA_SIGNING_KEY=<anything>` in
  `.dev.vars` (gitignored), `npx wrangler@4.141.0 r2 object put progressx-videos/videos/u/v.mp4 --file
  some.mp4 --content-type video/mp4 --local`, then `npx wrangler@4.141.0 dev --local` and request a
  link signed with that key.
