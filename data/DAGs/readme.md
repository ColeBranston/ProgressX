This folder contains all dags / jobs for data ingestion/processing in the apache solr search database

Note:
    solr_clean_core.delete(q='*:*') # Deletes everything in the core

WIP:
    Currently `Dockerfile` and `meta_data_db/` are for if I eventually want to migrate from github actions to apache airflow for job management

GitHub Actions -> Solr:
    The workflow (.github/workflows/schedule.yml) runs on the Mac mini's progressx-etl runner and reads the
    ingest URL (https://github-actions:<password>@progressx.ca/solr-ingest/) from Vault, secret/progressx/NginxFileConfig,
    key solr-ingest-url.txt. There is no GitHub secret for it.
