Made-up test data loaded into the throwaway Solr (ci/test) by the integration and end-to-end tests:

- `foods.json`: `foods` core documents, in the shape `data/foods/ingest_foods.py` writes (`to_solr_doc`)
- `studies.json`: `clean_ingestion_data` documents, as the clean-migration DAG writes them

None of it is real user data. The live Solr is never written to by tests.
