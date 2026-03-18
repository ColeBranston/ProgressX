import termcolor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from solr_instance import solr_clean_core

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
    print(f"{termcolor.colored('Link:', 'red')} {doc['id']}")
    print(f"{termcolor.colored('Title:', 'red')} {doc['title']}")
    print(f"{termcolor.colored('Journal:', 'red')} {doc['journal']}")
    print(f"{termcolor.colored('Published:', 'red')} {doc['published']}")
    print(f"{termcolor.colored('Content:', 'red')} {doc['content']}")
    print(f"{termcolor.colored('Journal:', 'red')} {doc['journal']}")

def solr_search(query: str):
    results = solr_clean_core.search(
        q=f'{query}',
        defType='edismax',
        qf='title^10 content^2',
        pf='title^10 content^2',
        ps=2,
        mm='85%',
        tie=0.1,
        rows=10
    )

    return results

@app.get("/")
def get_active():
    return "FASTAPI Search is Active"

@app.get("/status")
def read_root():
    return "online"

@app.get("/search/{query}")
def getResults(query:str):
    results = solr_search(query)
    for doc in results.docs:
        printDoc(doc)
    return results.docs
