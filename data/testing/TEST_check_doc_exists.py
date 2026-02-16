from solr_instance import *
from datetime import datetime, timezone

now = str(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

id_var = "This is the id"

results = solr_clean_core.search(f'id:"{id_var}"', fl="id", rows=1)

solr_clean_core.delete(q='*:*') # Deletes everything in the core

if results.hits >= 1:
    print("Documents found updating UPDATED_AT")
    solr_clean_core.add([
        {
            "id": f"{id_var}",
            "content": {"set": "This is the updated content body"},
            "updated_at": {"set": now}
        }
    ])

else:
    print("No document exists, adding new doc to core")
    solr_clean_core.add([
        {
            "id": f"{id_var}",
            "content" : "This is the content body where main abstracts will be stored",
            "created_at": now,
            "updated_at": now
        }
    ])
