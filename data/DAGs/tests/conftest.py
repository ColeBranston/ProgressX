import os
import sys

DAGS = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# the DAG scripts import their siblings as top-level modules, and doc_classes from both levels
for path in (os.path.dirname(DAGS), DAGS, os.path.join(DAGS, "doc_classes")):
    if path not in sys.path:
        sys.path.insert(0, path)
