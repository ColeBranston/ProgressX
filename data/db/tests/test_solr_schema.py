import urllib.error

import pytest

from testsupport import fixture, reset_core, solr_request

pytestmark = pytest.mark.integration

# The same query the app sends for the diet assistant's food search (progressx/src/app/api/libs/foodDatabase.ts)
FOOD_QUERY = {
    "defType": "edismax", "qf": "name^4 name_head^6 category", "pf": "name^8", "ps": "3",
    "boost": "product(boost,recip(name_length,0.04,1,0.6))", "bq": "name:(plain raw NFS)^20",
    "fl": "id,name", "rows": "8", "wt": "json", "mm": "2<-1 5<75%",
}


def food_search(q, **overrides):
    from urllib.parse import urlencode
    return [d["name"] for d in solr_request("foods/select?" + urlencode({**FOOD_QUERY, "q": q, **overrides}))["response"]["docs"]]


@pytest.fixture(scope="module", autouse=True)
def loaded(solr_available):
    reset_core("foods", fixture("foods.json"))
    reset_core("clean_ingestion_data", fixture("studies.json"))


def test_generic_food_ranks_above_branded_and_mixed():
    assert food_search("beef stew")[0] == "Stew, beef"
    assert food_search("greek yogurt")[0] == "Yogurt, Greek, plain, nonfat"
    assert food_search("hamburger")[0] == "Hamburger, double patty, on bun"
    assert food_search("banana")[0] == "Banana, raw"


def test_english_stemming():
    assert "Egg, whole, raw" in food_search("eggs")


def test_minimum_match_before_falling_back():
    # up to 2 words: all must match; 3-5 words: one may be missing (mm "2<-1 5<75%")
    assert food_search("kimchi stew") == []
    assert "Stew, beef" in food_search("kimchi stew", mm="1")
    assert food_search("beef kimchi stew")[0] == "Stew, beef"


def test_foods_core_refuses_unknown_fields():
    with pytest.raises(urllib.error.HTTPError):
        solr_request("foods/update?commit=true", [{"id": "survey-9", "name": "x", "unexpected_field": 1}])


def test_clean_core_requires_every_field():
    with pytest.raises(urllib.error.HTTPError):
        solr_request("clean_ingestion_data/update?commit=true", [{"id": "https://x.test/1", "title": "Missing the rest"}])


def test_clean_core_title_is_exact_match_and_content_is_full_text():
    from urllib.parse import quote
    hits = lambda q: solr_request(f"clean_ingestion_data/select?wt=json&q={quote(q)}")["response"]["numFound"]  # noqa: E731
    assert hits("title:Caffeine") == 0
    assert hits('title:"Caffeine and endurance performance"') == 1
    assert hits("content:cyclist") == 1  # stemmed


def test_created_at_defaults_to_now():
    doc = solr_request('clean_ingestion_data/select?wt=json&q=id:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC900001/"')["response"]["docs"][0]
    assert doc["created_at"].startswith("20")
