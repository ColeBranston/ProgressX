import termcolor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from solr_instance import solr_clean_core
import base64url

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

def solr_searchID(query: str):
    results = solr_clean_core.search(
        q=f'{query}',
        fl='id,title,journal',
        defType='edismax',
        qf='title^10 content^2',
        pf='title^10 content^2',
        ps=2,
        mm='85%',
        tie=0.1,
        rows=10
    )
    return results

def solr_searchDoc(id: str):
    result = solr_clean_core.search(
        q=f'id:"{id}"'
    )
    return result

cachedResults = {} # will eventually change to using redis, but will use this for now, main pain point with this implementation is that it isn't persistant across server restarts

@app.get("/")
def get_active():
    return "FASTAPI Search is Active"

@app.get("/status")
def read_root():
    return "online"

@app.get("/cached")
def getCached():
    return cachedResults

@app.get("/search/{query}")
def getResults(query:str):
    results = solr_searchID(query)

    global cachedResults # for accessing the in-memory cache
    cachedResults = results
    return results

@app.get("/doc/{id}")
def getDoc(id: str):
    decoded = base64url.dec(id).decode('utf-8')
    result = solr_searchDoc(decoded)
    return result
