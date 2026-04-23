import pysolr
from config import solrConfigs

env = solrConfigs["env"]

print(solrConfigs[env]+"raw_ingestion_data")

solr_raw_core = pysolr.Solr(
    solrConfigs[env]+"raw_ingestion_data/")

solr_clean_core = pysolr.Solr(
    solrConfigs[env]+"clean_ingestion_data/")

def reignite_core(core_name: str):
    match core_name:
        case "raw":
            return pysolr.Solr(solrConfigs[env]+"raw_ingestion_data/")
        case "clean":
            return pysolr.Solr(solrConfigs[env]+"clean_ingestion_data/")
        case _:
            raise Exception("Reignite Function Error: Core Not Found")