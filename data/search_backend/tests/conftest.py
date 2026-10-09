import importlib
import os
import sys

import fakeredis
import pytest

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BACKEND)


class FakeResults:
    def __init__(self, docs, hits=None):
        self.docs = docs
        self.hits = len(docs) if hits is None else hits


class FakeCore:
    """Records searches and answers from a list of docs, like pysolr.Solr.search"""

    def __init__(self, docs=()):
        self.docs = list(docs)
        self.calls = []

    def search(self, q, **params):
        self.calls.append({"q": q, **params})
        if q.startswith('id:"'):
            wanted = q[4:-1]
            return FakeResults([d for d in self.docs if d["id"] == wanted])
        start, rows = params.get("start", 0), params.get("rows", 10)
        return FakeResults(self.docs[start:start + rows], hits=len(self.docs))


@pytest.fixture
def backend(monkeypatch):
    """The FastAPI app with a fake Solr core and an in-memory Redis"""
    monkeypatch.delenv("REDIS_URL", raising=False)
    import search_cache
    import main
    cache = importlib.reload(search_cache)
    monkeypatch.setattr(cache, "_client", fakeredis.FakeRedis(decode_responses=True))
    app = importlib.reload(main)
    core = FakeCore()
    monkeypatch.setattr(app, "solr_clean_core", core)
    monkeypatch.setattr(app, "cachedResults", {})
    return app, core, cache
