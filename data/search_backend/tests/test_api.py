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
    assert first.json() == {"docs": [DOC] * 10, "hits": 25, "facets": {"year": [], "journal": []}}
    call = core.calls[-1]
    assert call["q"] == "creatine strength"
    assert call["start"] == 10 and call["rows"] == 10
    assert call["defType"] == "edismax" and call["qf"] == "title^10 content^2 authors_text^30 journal_text^20"

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
    assert TestClient(app.app).get("/search/5/nothing").json() == {"docs": [], "hits": 0, "facets": {"year": [], "journal": []}}


def test_author_and_journal_matches_are_boosted_above_the_abstract(backend):
    app, core, _ = backend
    TestClient(app.app).get("/search/0/schoenfeld volume")
    weights = lambda fields: dict(f.split("^") for f in fields.split())  # noqa: E731
    qf, pf = weights(core.calls[-1]["qf"]), weights(core.calls[-1]["pf"])
    for boosts in (qf, pf):
        assert float(boosts["authors_text"]) > float(boosts["title"]) > float(boosts["content"])
        assert float(boosts["journal_text"]) > float(boosts["title"])


def test_year_and_journal_filters(backend):
    app, core, _ = backend
    TestClient(app.app).get("/search/0/creatine", params={"year": ["2021", "2019"], "journal": 'J "Sports" Med'})
    call = core.calls[-1]
    assert call["fq"] == [
        '{!tag=year}published:("2019" OR "2021")',
        '{!tag=journal}journal:("J \\"Sports\\" Med")',
    ]
    # each facet's counts leave out its own filter, so picking a year still lists the other years
    assert call["facet.field"] == ["{!ex=year}published", "{!ex=journal}journal"]


def test_no_filters_sends_no_filter_queries(backend):
    app, core, _ = backend
    TestClient(app.app).get("/search/0/creatine")
    assert core.calls[-1]["fq"] == []


def test_facet_counts_come_back_newest_year_first(backend):
    app, core, _ = backend
    core.facet_fields = {"published": ["2019", 4, "2021", 2, "2022", 1], "journal": ["Sports Medicine", 5, "Nutrients", 2]}
    facets = TestClient(app.app).get("/search/0/creatine").json()["facets"]
    assert facets == {
        "year": [{"value": "2022", "count": 1}, {"value": "2021", "count": 2}, {"value": "2019", "count": 4}],
        "journal": [{"value": "Sports Medicine", "count": 5}, {"value": "Nutrients", "count": 2}],
    }


def test_filters_get_their_own_cache_entry(backend):
    app, core, _ = backend
    client = TestClient(app.app)
    client.get("/search/0/creatine")
    assert client.get("/search/0/creatine", params={"year": "2021"}).headers["X-Cache"] == "MISS"
    # the same filters in another order are the same search
    client.get("/search/0/creatine", params={"year": ["2021", "2020"]})
    assert client.get("/search/0/creatine", params={"year": ["2020", "2021"]}).headers["X-Cache"] == "HIT"
    assert len(core.calls) == 3


@pytest.mark.parametrize("params", [{"year": "21"}, {"year": "2021) OR (*:*"}, {"journal": "x" * 301}, {"year": [str(1900 + i) for i in range(51)]}])
def test_bad_filters_are_rejected(backend, params):
    app, core, _ = backend
    assert TestClient(app.app).get("/search/0/creatine", params=params).status_code == 422
    assert core.calls == []


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
    assert client.get("/cached").json() == {"docs": [DOC], "hits": 1, "facets": {"year": [], "journal": []}}
    assert client.get("/health").json()["cache"] == "disabled"
