import sys, os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))) # required for module tunneling to get access to the config.py

from solr_instance import solr_clean_core

solr_clean_core.delete(q="*:*")

from DAG_clean_migration import clean_migration_dag # Runs the import dag

clean_migration_dag()