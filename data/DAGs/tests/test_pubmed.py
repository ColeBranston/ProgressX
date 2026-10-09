import xml.etree.ElementTree as ET

import pytest

import DAG_raw_pubMed as raw
from doc_classes.pubMed_doc import pubMed_doc


def article(pmc="PMC123", doi="10.1/abc", title="Creatine and strength", year="2021", abstract=("Part one.", "Part two."), journal="J Sports"):
    ids = "".join(f'<ArticleId IdType="{kind}">{value}</ArticleId>' for kind, value in (("pmc", pmc), ("doi", doi)) if value)
    texts = "".join(f"<AbstractText>{t}</AbstractText>" for t in abstract)
    return ET.fromstring(f"""<PubmedArticle><MedlineCitation><PMID>42</PMID><Article>
        <Journal><Title>{journal}</Title><JournalIssue><PubDate><Year>{year}</Year></PubDate></JournalIssue></Journal>
        <ArticleTitle>{title}</ArticleTitle><Abstract>{texts}</Abstract></Article></MedlineCitation>
        <PubmedData><ArticleIdList>{ids}</ArticleIdList></PubmedData></PubmedArticle>""")


def test_parse_article_prefers_the_pmc_link():
    doc = raw.parse_article(article(), updated_at="2026-10-01T00:00:00Z")
    assert doc == {
        "id": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/",
        "content": "Part one. Part two.",
        "updated_at": "2026-10-01T00:00:00Z",
        "published": "2021",
        "type": "pubMed",
        "additional": "title:Creatine and strength||journal:J Sports||pmid:42",
    }


def test_parse_article_falls_back_to_the_doi():
    assert raw.parse_article(article(pmc=None))["id"] == "https://doi.org/10.1/abc"


@pytest.mark.parametrize("changes", [{"pmc": None, "doi": None}, {"title": ""}, {"year": ""}, {"abstract": ()}])
def test_parse_article_skips_unusable_records(changes):
    assert raw.parse_article(article(**changes)) is None


def test_clean_doc_reads_title_and_journal_from_additional():
    raw_doc = raw.parse_article(article(), updated_at="2026-10-01T00:00:00Z")
    clean = pubMed_doc(raw_doc).getDoc()
    assert clean == {
        "id": raw_doc["id"],
        "title": "Creatine and strength",
        "content": "Part one. Part two.",
        "journal": "J Sports",
        "published": "2021",
        "updated_at": "2026-10-01T00:00:00Z",
    }


def test_clean_doc_keeps_colons_in_titles():
    raw_doc = {"id": "x", "content": "c", "published": "2020", "updated_at": "t", "additional": "title:Sleep: a review||journal:J||pmid:1"}
    assert pubMed_doc(raw_doc).getDoc()["title"] == "Sleep: a review"


class Response:
    def __init__(self, text):
        self.text = text


def test_fetch_and_load_pages_through_results(monkeypatch):
    search = "<eSearchResult><Count>2</Count><WebEnv>env</WebEnv><QueryKey>1</QueryKey></eSearchResult>"
    batch = "<PubmedArticleSet>" + ET.tostring(article()).decode() + ET.tostring(article(pmc=None, doi=None)).decode() + "</PubmedArticleSet>"
    calls = []

    def fake_get(url, params):
        calls.append((url.rsplit("/", 1)[-1], params))
        return Response(search if url.endswith("esearch.fcgi") else batch)

    loaded = []
    monkeypatch.setattr(raw.requests, "get", fake_get)
    monkeypatch.setattr(raw.time, "sleep", lambda _: None)
    monkeypatch.setattr(raw.solr_raw_core, "add", loaded.extend)

    raw.fetch_and_load("creatine", 2021)
    assert calls[0][1]["term"] == "(creatine) AND 2021[dp]"
    assert calls[1][1]["WebEnv"] == "env"
    assert [doc["id"] for doc in loaded] == ["https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123/"]


def test_fetch_and_load_stops_when_nothing_found(monkeypatch):
    monkeypatch.setattr(raw.requests, "get", lambda url, params: Response("<eSearchResult><Count>0</Count></eSearchResult>"))
    monkeypatch.setattr(raw.solr_raw_core, "add", lambda docs: pytest.fail("nothing should be loaded"))
    raw.fetch_and_load("nothing", 2000)


def test_main_retries_a_year_three_times_then_gives_up(monkeypatch):
    attempts = []
    monkeypatch.setattr(raw, "START_YEAR", 2020)
    monkeypatch.setattr(raw, "END_YEAR", 2020)
    monkeypatch.setattr(raw, "QUERIES", ["q"])

    def failing(query, year):
        attempts.append(year)
        raise ConnectionError("NCBI down")

    monkeypatch.setattr(raw, "fetch_and_load", failing)
    with pytest.raises(Exception, match="Retry Count Hit Maximum"):
        raw.main()
    assert attempts == [2020, 2020, 2020]
