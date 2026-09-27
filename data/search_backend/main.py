import termcolor
from fastapi import FastAPI, Path, Response
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

def solr_searchID(query: str, pageNum: int):
    results = solr_clean_core.search(
        q=f'{query}',
        fl='id,title,journal',
        defType='edismax',
        qf='title^10 content^2',
        pf='title^10 content^2',
        ps=2,
        mm='85%',
        tie=0.1,
        rows=10,
        start=pageNum*10
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

def toResponse(results):
    # always return the same shape, even when a page has no docs
    return {"docs": list(results.docs), "hits": results.hits}

@app.get("/search/{pageNum}/{query:path}") # :path so queries containing "/" still match
def getResults(query:str, response: Response, pageNum:int = Path(ge=0)):
    key = search_cache.search_key(query, pageNum)
    results = search_cache.get_json(key)
    response.headers["X-Cache"] = "HIT" if results is not None else "MISS"

    if results is None:
        results = toResponse(solr_searchID(query, pageNum))
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
