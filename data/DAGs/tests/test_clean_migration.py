import pytest

import DAG_clean_migration as migration


class Results(list):
    hits = 0


class RawCore:
    def __init__(self, docs):
        self.docs = docs

    def search(self, q, fl=None, start=0, rows=10):
        results = Results(self.docs[start:start + rows] if fl != "" else [])
        results.hits = len(self.docs)
        return results


class CleanCore:
    def __init__(self, failures=0):
        self.failures = failures
        self.added = []

    def add(self, docs):
        if self.failures:
            self.failures -= 1
            raise ConnectionError("Solr hiccup")
        self.added.extend(docs)


RAW = [
    {"id": "a", "type": "pubMed", "content": "c", "published": "2020", "updated_at": "old", "additional": "title:A||journal:J||pmid:1"},
    {"id": "b", "type": "somethingElse"},
    {"id": "c", "type": "pubMed", "content": "c", "published": "2021", "updated_at": "old", "additional": "broken"},
]


@pytest.fixture
def cores(monkeypatch):
    def setup(failures=0):
        clean = CleanCore(failures)
        monkeypatch.setattr(migration, "solr_raw_core", RawCore(RAW))
        monkeypatch.setattr(migration, "solr_clean_core", clean)
        monkeypatch.setattr(migration, "reignite_core", lambda name: clean)
        return clean
    return setup


def test_migrates_pubmed_docs_and_skips_the_rest(cores):
    clean = cores()
    migration.clean_migration_dag()
    assert [doc["id"] for doc in clean.added] == ["a"]
    assert clean.added[0]["title"] == "A"
    assert clean.added[0]["updated_at"] != "old"


@pytest.mark.regression
def test_a_successful_retry_does_not_fail_the_run(cores):
    """The retry loop used to keep adding the same chunk 3 times and then raise even after it worked"""
    clean = cores(failures=1)
    migration.clean_migration_dag()
    assert [doc["id"] for doc in clean.added] == ["a"]


def test_gives_up_after_three_failed_retries(cores):
    cores(failures=4)
    with pytest.raises(Exception, match="Retry Count Hit Maximum"):
        migration.clean_migration_dag()
