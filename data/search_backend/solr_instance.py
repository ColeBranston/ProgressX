import pysolr
from config import solrConfigs

env = solrConfigs["env"]

solr_raw_core = pysolr.Solr(
    solrConfigs[env]+"raw_ingestion_data/")

solr_clean_core = pysolr.Solr(
    solrConfigs[env]+"clean_ingestion_data/")
