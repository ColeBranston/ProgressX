import os
from dotenv import load_dotenv

load_dotenv()

# Get absolute path to .env in the same directory as config.py

solrConfigs = {
    "env": os.environ.get("env", "local"),
    "local": os.environ.get("local_url", "http://localhost:8983"),
    "prod": os.environ.get("prod_url")
}

print(solrConfigs)
