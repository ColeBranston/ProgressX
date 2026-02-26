import termcolor

from fastapi import FastAPI

from solr_instance import solr_clean_core

def printDoc(doc):
    print(f"{termcolor.colored("=" * 100, "red")}")
    print(f"{termcolor.colored("Clean Solr Document","red")}".rjust(65))
    print(f"{termcolor.colored("=" * 100, "red")}")
    print(f"{termcolor.colored("Link:", "red")} {doc["id"]}")
    print(f"{termcolor.colored("Title:", "red")} {doc["title"]}")
    print(f"{termcolor.colored("Journal:", "red")} {doc["journal"]}")
    print(f"{termcolor.colored("Published:", "red")} {doc["published"]}")
    print(f"{termcolor.colored('Content:', "red")} {doc["content"]}")
    print(f"{termcolor.colored("Journal:", "red")} {doc["journal"]}")

app = FastAPI()

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

@app.get("/status")
def read_root():
    return "online"

@app.get("/search/{query}")
def getResults(query:str):
    docs = solr_search(query)
    return docs
