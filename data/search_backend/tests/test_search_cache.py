import fakeredis
import redis

import search_cache


def test_normalize_query_only_squeezes_whitespace():
    assert search_cache.normalize_query("  protein \n\t intake ") == "protein intake"
    # title is an exact-match field, so case must not be folded
    assert search_cache.normalize_query("Protein") != search_cache.normalize_query("protein")


def test_keys_are_short_namespaced_and_distinct():
    key = search_cache.search_key("a" * 5000, 0)
    assert key.startswith("progressx:search:v1:results:") and len(key) < 120
    assert search_cache.search_key("protein  intake", 0) == search_cache.search_key("protein intake", 0)
    assert search_cache.search_key("protein", 0) != search_cache.search_key("protein", 1)
    assert search_cache.doc_key("x") != search_cache.search_key("x", 0)


def test_round_trips_json_with_ttl(monkeypatch):
    client = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(search_cache, "_client", client)
    search_cache.set_json("k", {"docs": [1, 2]}, 60)
    assert search_cache.get_json("k") == {"docs": [1, 2]}
    assert 0 < client.ttl("k") <= 60
    assert search_cache.get_json("missing") is None
    assert search_cache.is_available()


class BrokenRedis:
    def get(self, *_):
        raise redis.ConnectionError("down")

    def set(self, *_, **__):
        raise redis.TimeoutError("slow")

    def ping(self):
        raise redis.ConnectionError("down")


def test_degrades_to_no_cache_when_redis_fails(monkeypatch, capsys):
    monkeypatch.setattr(search_cache, "_client", BrokenRedis())
    assert search_cache.get_json("k") is None
    search_cache.set_json("k", {"a": 1})  # must not raise
    assert not search_cache.is_available()
    assert "continuing without cache" in capsys.readouterr().out


def test_no_redis_configured(monkeypatch):
    monkeypatch.setattr(search_cache, "_client", None)
    assert search_cache.get_json("k") is None
    search_cache.set_json("k", 1)
    assert not search_cache.is_available()


def test_ignores_corrupt_cache_entries(monkeypatch):
    client = fakeredis.FakeRedis(decode_responses=True)
    client.set("k", "{not json")
    monkeypatch.setattr(search_cache, "_client", client)
    assert search_cache.get_json("k") is None
