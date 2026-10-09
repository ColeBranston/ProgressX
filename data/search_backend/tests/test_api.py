import base64

import pytest
from fastapi.testclient import TestClient


def b64url(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


DOC = {"id": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1/", "title": "Creatine", "journal": "J"}


def test_status_endpoints(backend):
    app, _, _ = backend
    client = TestClient(app.app)
    assert client.get("/").json() == "FASTAPI Search is Active"
    assert client.get("/status").json() == "online"
    assert client.get("/health").json() == {"status": "online", "cache": "redis"}


def test_search_uses_edismax_and_caches(backend):
    app, core, _ = backend
    core.docs = [DOC] * 25
    client = TestClient(app.app)

    first = client.get("/search/1/creatine strength")
    assert first.status_code == 200
    assert first.headers["X-Cache"] == "MISS"
    assert first.json() == {"docs": [DOC] * 10, "hits": 25}
    call = core.calls[-1]
    assert call["q"] == "creatine strength"
    assert call["start"] == 10 and call["rows"] == 10
    assert call["defType"] == "edismax" and call["qf"] == "title^10 content^2"

    second = client.get("/search/1/creatine   strength")
    assert second.headers["X-Cache"] == "HIT"
    assert len(core.calls) == 1
    assert client.get("/cached").json() == second.json()


def test_search_keeps_slashes_in_the_query(backend):
    app, core, _ = backend
    TestClient(app.app).get("/search/0/push/pull legs")
    assert core.calls[-1]["q"] == "push/pull legs"


def test_negative_pages_are_rejected(backend):
    app, _, _ = backend
    assert TestClient(app.app).get("/search/-1/x").status_code == 422


def test_empty_page_has_the_same_shape(backend):
    app, _, _ = backend
    assert TestClient(app.app).get("/search/5/nothing").json() == {"docs": [], "hits": 0}


def test_doc_lookup_decodes_base64url_ids(backend):
    app, core, _ = backend
    core.docs = [DOC]
    client = TestClient(app.app)
    res = client.get(f"/doc/{b64url(DOC['id'])}")
    assert res.json() == {"docs": [DOC], "hits": 1}
    assert core.calls[-1]["q"] == f'id:"{DOC["id"]}"'
    assert client.get(f"/doc/{b64url(DOC['id'])}").headers["X-Cache"] == "HIT"


@pytest.mark.regression
def test_a_missing_doc_is_not_cached(backend):
    """A document ingested after someone looked for it must show up right away"""
    app, core, _ = backend
    client = TestClient(app.app)
    doc_id = b64url(DOC["id"])
    assert client.get(f"/doc/{doc_id}").json() == {"docs": [], "hits": 0}
    core.docs = [DOC]
    res = client.get(f"/doc/{doc_id}")
    assert res.headers["X-Cache"] == "MISS"
    assert res.json()["hits"] == 1


def test_cached_falls_back_to_memory_without_redis(backend, monkeypatch):
    app, core, cache = backend
    monkeypatch.setattr(cache, "_client", None)
    core.docs = [DOC]
    client = TestClient(app.app)
    client.get("/search/0/creatine")
    assert client.get("/cached").json() == {"docs": [DOC], "hits": 1}
    assert client.get("/health").json()["cache"] == "disabled"
