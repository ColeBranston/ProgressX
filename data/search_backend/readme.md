# Run Command

python -m uvicorn main:app --reload

# Docker Command (outdated) -> no point, deployment on serverless vercel

docker run --rm -p 8000:8000 --name local_backend --env-file .env search_backend

# Redis cache

Search results and documents are cached in Redis when `REDIS_URL` is set (docker compose sets it to the `redis` service).
Without it, or if Redis is down, search still works, just uncached. Responses carry `X-Cache: HIT` or `MISS`.

- `SEARCH_CACHE_TTL_SECONDS` (default 3600) and `DOC_CACHE_TTL_SECONDS` (default 86400) control how long entries live
- Clear the cache after a big ingestion run: `docker compose exec redis redis-cli FLUSHDB`
