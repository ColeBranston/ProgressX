import hashlib
import json
import os
import re

import redis
import termcolor

# Redis cache for search results. Every call degrades to "no cache" if Redis is
# unset or unreachable, so search keeps working (just uncached) without it.

REDIS_URL = os.environ.get("REDIS_URL")
SEARCH_TTL_SECONDS = int(os.environ.get("SEARCH_CACHE_TTL_SECONDS", "3600"))   # results refresh hourly as new studies are ingested
DOC_TTL_SECONDS = int(os.environ.get("DOC_CACHE_TTL_SECONDS", "86400"))        # a single document rarely changes

# bump the version to invalidate every cached entry after changing the response shape
KEY_PREFIX = "progressx:search:v1"
RECENT_KEY = f"{KEY_PREFIX}:recent"

_client = redis.Redis.from_url(
    REDIS_URL,
    decode_responses=True,
    socket_timeout=0.5,          # a slow or down Redis must never slow search down much
    socket_connect_timeout=0.5,
) if REDIS_URL else None


def _warn(action, error):
    print(termcolor.colored(f"Redis {action} failed, continuing without cache: {error}", "yellow"))


def _key(kind, *parts):
    # hash so any query (length, spaces, symbols) makes a short, safe key
    digest = hashlib.sha256("\x1f".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}:{kind}:{digest}"


def normalize_query(query: str) -> str:
    # only whitespace is normalized: title is an exact-match (string) field in Solr,
    # so "Protein" and "protein" can rank differently and must not share a cache entry
    return re.sub(r"\s+", " ", query).strip()


def search_key(query: str, page_num: int) -> str:
    return _key("results", normalize_query(query), page_num)


def doc_key(doc_id: str) -> str:
    return _key("doc", doc_id)


def get_json(key):
    if _client is None:
        return None
    try:
        raw = _client.get(key)
        return json.loads(raw) if raw is not None else None
    except (redis.RedisError, ValueError) as error:
        _warn("read", error)
        return None


def set_json(key, value, ttl_seconds=None):
    if _client is None:
        return
    try:
        _client.set(key, json.dumps(value), ex=ttl_seconds)
    except (redis.RedisError, TypeError) as error:
        _warn("write", error)


def is_available() -> bool:
    if _client is None:
        return False
    try:
        return bool(_client.ping())
    except redis.RedisError:
        return False
