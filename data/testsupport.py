import json
import os
import pathlib
import urllib.request

# Helpers shared by the Python test suites: the fixture data in ci/test/fixtures and the throwaway
# Solr / Redis from ci/test/docker-compose.yml (never the live ones).

FIXTURES = pathlib.Path(__file__).resolve().parent.parent / "ci" / "test" / "fixtures"
SOLR_TEST_URL = os.environ.get("SOLR_TEST_URL", "http://127.0.0.1:8984/solr/").rstrip("/") + "/"
REDIS_TEST_URL = os.environ.get("REDIS_TEST_URL", "redis://127.0.0.1:6380/0")



def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def solr_request(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(SOLR_TEST_URL + path, data=data, headers={"Content-Type": "application/json"}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read() or b"{}")


def reset_core(core, docs):
    """Empties a throwaway test core and loads `docs` into it."""
    if "127.0.0.1:8983" in SOLR_TEST_URL or "localhost:8983" in SOLR_TEST_URL:
        raise RuntimeError("Refusing to write to what looks like the live Solr (port 8983)")
    solr_request(f"{core}/update?commit=true", {"delete": {"query": "*:*"}})
    if docs:
        solr_request(f"{core}/update?commit=true", docs)
