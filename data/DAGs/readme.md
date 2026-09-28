This folder contains all dags / jobs for data ingestion/processing in the apache solr search database

Note:
    solr_clean_core.delete(q='*:*') # Deletes everything in the core

WIP:
    Currently `Dockerfile` and `meta_data_db/` are for if I eventually want to migrate from github actions to apache airflow for job management

GitHub Actions -> Solr:
    The workflow (.github/workflows/schedule.yml) reads the SOLR_PROD_URL secret. Set it to the value in
    nginx/solr-ingest-url.txt (gitignored), i.e. https://github-actions:<password>@progressx.ca/solr-ingest/
    nginx checks the password (HTTP Basic auth, sent automatically by pysolr/requests from the URL) and only
    exposes the select and update handlers of raw_ingestion_data and clean_ingestion_data.
    Set it from the repo root with: gh secret set SOLR_PROD_URL < nginx/solr-ingest-url.txt
