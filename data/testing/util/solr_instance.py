import pysolr
from ..config import solrConfigs

env = solrConfigs["env"]

solr = pysolr.Solr(solrConfigs[env],timeout=10)