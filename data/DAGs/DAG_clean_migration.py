from solr_instance import solr_raw_core, solr_clean_core
import sys, os
from datetime import datetime, timezone
import math

sys.path.append(os.path.abspath(os.path.dirname(__file__)+"\\doc_classes")) # required for module tunneling to get access to the config.py
from doc_classes.pubMed_doc import pubMed_doc

def clean_migration_dag():
    now = str(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

    document_count = solr_raw_core.search('*:*', fl="").hits

    chunk_size = 10000
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

                clean_article['updated_at'] = now
                articles.append(clean_article)
            except Exception as e:
                print(e)
                

        print(f"Docs loading to clean core: {len(articles)}")
        solr_clean_core.add(articles)

        start += chunk_size
        counter += 1

    print("\nLoading Complete")

if __name__ == "__main__":
    clean_migration_dag()