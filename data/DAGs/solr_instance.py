import pysolr
from config import solrConfigs

env = solrConfigs["env"]

print(solrConfigs[env]+"raw_ingestion_data")

solr_raw_core = pysolr.Solr(
    solrConfigs[env]+"raw_ingestion_data/",  timeout=200)

solr_clean_core = pysolr.Solr(
    solrConfigs[env]+"clean_ingestion_data/",  timeout=200)

def reignite_core(core_name: str):
    match core_name:
        case "raw":
            return pysolr.Solr(solrConfigs[env]+"raw_ingestion_data/", timeout=200)
        case "clean":
            return pysolr.Solr(solrConfigs[env]+"clean_ingestion_data/", timeout=200)
        case _:
            raise Exception("Reignite Function Error: Core Not Found", timeout=200)