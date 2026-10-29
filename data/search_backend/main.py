import re
import termcolor
from fastapi import FastAPI, HTTPException, Path, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from solr_instance import solr_clean_core
import base64url
import search_cache

app = FastAPI()

origins = [
    "http://localhost:3000" # add my prod frontend url later
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def printDoc(doc):
    print(termcolor.colored('=' * 100, 'red'))
    print(termcolor.colored('Clean Solr Document', 'red').rjust(65))
    print(termcolor.colored('=' * 100, 'red'))
    print(f"{termcolor.colored('Link:', 'red')} {doc.get('id', 'N/A')}")
    print(f"{termcolor.colored('Title:', 'red')} {doc.get('title', 'N/A')}")
    print(f"{termcolor.colored('Journal:', 'red')} {doc.get('journal', 'N/A')}")
    print(f"{termcolor.colored('Published:', 'red')} {doc.get('published', 'N/A')}")
    print(f"{termcolor.colored('Content:', 'red')} {doc.get('content', 'N/A')}")
    print(f"{termcolor.colored('Journal:', 'red')} {doc.get('journal', 'N/A')}")

YEAR = re.compile(r"^\d{4}$")
MAX_FILTER_VALUES = 50
JOURNAL_FACET_LIMIT = 20 # the most common journals for the current search

def quoted(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

def filter_queries(years, journals):
    # each facet is tagged so its own counts ignore it (pick 2020 and 2021 still shows every year),
    # values within a facet are OR'd, and the facets are AND'd together
    fq = []
    if years:
        fq.append("{!tag=year}published:(" + " OR ".join(quoted(y) for y in years) + ")")
    if journals:
        fq.append("{!tag=journal}journal:(" + " OR ".join(quoted(j) for j in journals) + ")")
    return fq

def solr_searchID(query: str, pageNum: int, years=(), journals=()):
    results = solr_clean_core.search(
        q=f'{query}',
        fl='id,title,journal,published,authors',
        defType='edismax',
        # author and journal names weigh far more than the abstract, so "Schoenfeld volume" or
        # "Sports Medicine creatine" finds that author's or journal's studies first
        qf='title^10 content^2 authors_text^30 journal_text^20',
        pf='title^10 content^2 authors_text^40 journal_text^30',
        ps=2,
        mm='85%',
        tie=0.1,
        rows=10,
        start=pageNum*10,
        fq=filter_queries(years, journals),
        facet='true',
        **{
            "facet.field": ["{!ex=year}published", "{!ex=journal}journal"],
            "facet.mincount": 1,
            "f.published.facet.limit": -1,
            "f.published.facet.sort": "index",
            "f.journal.facet.limit": JOURNAL_FACET_LIMIT,
        },
    )
    return results

def solr_searchDoc(id: str):
    result = solr_clean_core.search(
        q=f'id:"{id}"'
    )
    return result

cachedResults = {} # fallback for the most recent search when Redis isn't available (lost on restart)

@app.get("/")
def get_active():
    return "FASTAPI Search is Active"

@app.get("/status")
def read_root():
    return "online"

@app.get("/health")
def health():
    return {"status": "online", "cache": "redis" if search_cache.is_available() else "disabled"}

@app.get("/cached")
def getCached():
    # the most recent search, kept in Redis so it survives backend restarts
    recent = search_cache.get_json(search_cache.RECENT_KEY)
    return recent if recent is not None else cachedResults

def facetCounts(results, field):
    # Solr returns facet counts as a flat [value, count, value, count, ...] list
    flat = (getattr(results, "facets", None) or {}).get("facet_fields", {}).get(field, [])
    return [{"value": value, "count": count} for value, count in zip(flat[::2], flat[1::2])]

def toResponse(results):
    # always return the same shape, even when a page has no docs
    return {"docs": list(results.docs), "hits": results.hits}

def toSearchResponse(results):
    return {
        **toResponse(results),
        "facets": {
            "year": list(reversed(facetCounts(results, "published"))), # newest first
            "journal": facetCounts(results, "journal"),
        },
    }

def cleanFilters(values, name, valid):
    values = sorted({v.strip() for v in values if v.strip()})
    if len(values) > MAX_FILTER_VALUES or not all(valid(v) for v in values):
        raise HTTPException(status_code=422, detail=f"invalid {name} filter")
    return values

@app.get("/search/{pageNum}/{query:path}") # :path so queries containing "/" still match
def getResults(query:str, response: Response, pageNum:int = Path(ge=0), year: list[str] = Query(default=[]), journal: list[str] = Query(default=[])):
    # ?year=2021&year=2020&journal=Sports%20Medicine
    years = cleanFilters(year, "year", YEAR.match)
    journals = cleanFilters(journal, "journal", lambda j: len(j) <= 300)

    key = search_cache.search_key(query, pageNum, years, journals)
    results = search_cache.get_json(key)
    response.headers["X-Cache"] = "HIT" if results is not None else "MISS"

    if results is None:
        results = toSearchResponse(solr_searchID(query, pageNum, years, journals))
        search_cache.set_json(key, results, search_cache.SEARCH_TTL_SECONDS)

    global cachedResults # in-memory fallback for /cached
    cachedResults = results
    search_cache.set_json(search_cache.RECENT_KEY, results)
    return results

@app.get("/doc/{id}")
def getDoc(id: str, response: Response):
    decoded = base64url.dec(id).decode('utf-8')

    key = search_cache.doc_key(decoded)
    result = search_cache.get_json(key)
    response.headers["X-Cache"] = "HIT" if result is not None else "MISS"

    if result is None:
        result = toResponse(solr_searchDoc(decoded))
        # don't cache a miss, so a document ingested later shows up right away
        if result["docs"]:
            search_cache.set_json(key, result, search_cache.DOC_TTL_SECONDS)

    return result
