# Solr cores

Each folder in `configsets/` holds one core's settings (`conf/`: schema, `solrconfig.xml`, synonyms,
stopwords). They're the source of truth: CI builds empty test cores from them, and every deploy copies
changed settings into the live cores and reloads them (see "Deploying" in `docs/ci.md`). To change a
core, edit its `conf/` here and merge; to add a core, add a folder. The live index lives in
`~/server-data/progressx/solr` on the Mac mini, never in this repo.

The notes below are older manual commands, kept for reference.

# Current Main Docker Run Command

docker run --rm -v "$PWD/var/solr:/var/solr" -p 8983:8983 --name local_solr solr

# Create A Core

docker run --rm -v "$PWD/var/solr:/var/solr" -p 8983:8983 --name local_solr solr solr-precreate {core_name}

# Home Server Deployment

docker run -d -v "$PWD/var/solr:/var/solr" -p 8983:8983 --restart unless-stopped --name deployed_solr production_solr -f --user-managed

# GCP VM Deployment

sudo chown -R 8983:8983 var/solr

docker run -d -v "$PWD/var/solr:/var/solr" -e SOLR_JAVA_MEM="-Xms256m -Xmx256m" -p 8983:8983 --name deployed_solr production_solr -f --user-managed
