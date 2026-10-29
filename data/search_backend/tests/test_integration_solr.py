import base64
import importlib
import sys

import pytest
from fastapi.testclient import TestClient

from testsupport import REDIS_TEST_URL, SOLR_TEST_URL, fixture, reset_core

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def live_backend(solr_available):
    """The real app against the throwaway Solr and Redis, with the fixture studies loaded"""
    import redis
    reset_core("clean_ingestion_data", fixture("studies.json"))
    redis.Redis.from_url(REDIS_TEST_URL).flushdb()
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv("solr_local_url", SOLR_TEST_URL)
        mp.setenv("python_backend_env", "local")
        mp.setenv("REDIS_URL", REDIS_TEST_URL)
        for name in ("config", "solr_instance", "search_cache", "main"):
            sys.modules.pop(name, None)
        main = importlib.import_module("main")
        yield TestClient(main.app)
    for name in ("config", "solr_instance", "search_cache", "main"):
        sys.modules.pop(name, None)


def test_finds_studies_by_their_abstract(live_backend):
    body = live_backend.get("/search/0/creatine bench press").json()
    assert body["hits"] == 1
    assert body["docs"][0]["title"] == "Creatine supplementation and strength"
    assert set(body["docs"][0]) == {"id", "title", "journal", "published"}  # no authors on this one


def test_stemming_and_minimum_match(live_backend):
    # text_en stems "hypertrophied"/"hypertrophy"; mm=85% needs nearly every word
    titles = {d["title"] for d in live_backend.get("/search/0/protein hypertrophy").json()["docs"]}
    assert titles == {"Protein intake and muscle hypertrophy in resistance-trained adults", "Training volume dose response"}
    assert live_backend.get("/search/0/protein hypertrophy caffeine cyclists").json()["hits"] == 0


def test_exact_title_ranks_first(live_backend):
    docs = live_backend.get("/search/0/Training volume dose response").json()["docs"]
    assert docs[0]["title"] == "Training volume dose response"


def test_finds_studies_by_author(live_backend):
    titles = lambda q: [d["title"] for d in live_backend.get(f"/search/0/{q}").json()["docs"]]  # noqa: E731
    assert titles("phillips") == ["Protein intake and muscle hypertrophy in resistance-trained adults"]
    assert set(titles("Schoenfeld")) == {"Protein intake and muscle hypertrophy in resistance-trained adults", "Training volume dose response"}
    # an author and a word from the abstract together
    assert titles("schoenfeld set volume") == ["Training volume dose response"]
    doc = live_backend.get("/search/0/phillips").json()["docs"][0]
    assert doc["authors"] == ["Stuart M Phillips", "Brad J Schoenfeld"]


def test_journal_matches_rank_above_abstract_matches(live_backend):
    # "strength" is in two abstracts and in the journal name of two other studies
    docs = live_backend.get("/search/0/strength").json()["docs"]
    assert [d["journal"] for d in docs[:2]] == ["Journal of Strength Research"] * 2
    assert {d["title"] for d in docs[2:]} == {"Creatine supplementation and strength", "Sleep duration and recovery"}


def test_year_facets_and_filters(live_backend):
    body = live_backend.get("/search/0/strength").json()
    assert body["facets"]["year"] == [{"value": y, "count": 1} for y in ("2022", "2021", "2020", "2019")]
    assert {"value": "Journal of Strength Research", "count": 2} in body["facets"]["journal"]

    picked = live_backend.get("/search/0/strength", params={"year": ["2019", "2022"]}).json()
    assert picked["hits"] == 2
    assert {d["published"] for d in picked["docs"]} == {"2019", "2022"}
    # the year counts still list every year, so more can be picked
    assert len(picked["facets"]["year"]) == 4

    both = live_backend.get("/search/0/strength", params={"year": ["2020", "2021", "2022"], "journal": "Journal of Strength Research"}).json()
    assert {d["title"] for d in both["docs"]} == {"Protein intake and muscle hypertrophy in resistance-trained adults", "Training volume dose response"}


def test_results_are_cached_in_redis(live_backend):
    assert live_backend.get("/search/0/caffeine").headers["X-Cache"] == "MISS"
    assert live_backend.get("/search/0/caffeine").headers["X-Cache"] == "HIT"
    assert live_backend.get("/health").json()["cache"] == "redis"


def test_fetches_a_whole_document_by_id(live_backend):
    study = fixture("studies.json")[2]
    encoded = base64.urlsafe_b64encode(study["id"].encode()).decode().rstrip("=")
    doc = live_backend.get(f"/doc/{encoded}").json()["docs"][0]
    assert doc["content"] == study["content"]
    assert doc["journal"] == study["journal"]


def test_solr_syntax_in_a_query_is_not_an_error(live_backend):
    assert live_backend.get('/search/0/protein AND (title:"x" OR *:*)').status_code == 200
