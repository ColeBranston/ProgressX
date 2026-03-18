import pysolr
from config import solrConfigs

env = solrConfigs["env"]

solr_raw_core = pysolr.Solr(
    solrConfigs[env]+"raw_ingestion_data/", timeout=10)

solr_clean_core = pysolr.Solr(
    solrConfigs[env]+"clean_ingestion_data/", timeout=10)
