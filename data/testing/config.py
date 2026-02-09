import os

'''

Config file for data pipeline core configs

'''


solrConfigs = {
    "env": os.environ.get("env") or "local",
    "local": os.environ.get("local_url") or "localhost:8983",
    "prod": os.environ.get("prod_url")
}
