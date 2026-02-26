import os
from dotenv import load_dotenv

load_dotenv()

# Get absolute path to .env in the same directory as config.py

solrConfigs = {
    "env": os.environ.get("python_backend_env", "local"),
    "local": os.environ.get("solr_local_url", "http://localhost:8983/solr/"),
    "prod": os.environ.get("solr_prod_url")
}

clean_schema = {
    "id": None,
    "title": None,
    "content": None,
    "journal": None,
    "published": None,
    "updated_at": None,
}

print(solrConfigs)
