from solr_instance import solr_raw_core, solr_clean_core, reignite_core
from datetime import datetime, timezone
import math
import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "doc_classes")))

from doc_classes.pubMed_doc import pubMed_doc


def clean_migration_dag():
    global solr_clean_core 
    now = str(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

    document_count = solr_raw_core.search('*:*', fl="").hits

    chunk_size = 5000
    start = 0

    counter = 1
    total_chunks = math.ceil(document_count / chunk_size)
    print("Starting data migration from raw to clean...")

    while counter <= total_chunks:
        articles = []

        print(f"\nIngesting {counter} of {total_chunks} Chunks")

        for article in solr_raw_core.search('*:*', start=start, rows=chunk_size):
            try:
                match article['type']:
                    case "pubMed":
                        clean_article = pubMed_doc(article).getDoc()

                    case _:
                        print("No Match Found")
                        continue

                clean_article['updated_at'] = now
                articles.append(clean_article)
            except Exception as e:
                print(e)

        print(f"Docs loading to clean core: {len(articles)}")
        
        try:
            solr_clean_core.add(articles)
        except Exception as e:
            solr_clean_core = reignite_core("clean")
            retry = 0
            print("Error thrown during SOLR chunk ingestion: ", e)
            while retry < 3:
                print(f'Current Retry Count: {retry}/3')
                solr_clean_core.add(articles)
                retry += 1

            if retry >= 3:
                raise Exception(f'Retry Count Hit Maximum: {retry}/3')

        start += chunk_size
        counter += 1

    print("\nLoading Complete")

if __name__ == "__main__":
    clean_migration_dag()