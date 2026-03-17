# Current Main Docker Run Command

docker run --rm -v "$PWD/var/solr:/var/solr" -p 8983:8983 --name local_solr solr

# Create A Core

docker run --rm -v "$PWD/var/solr:/var/solr" -p 8983:8983 --name local_solr solr solr-precreate {core_name}

# GCP VM Deployment

sudo chown -R 8983:8983 var/solr

docker run -d -v "$PWD/var/solr:/var/solr" -e SOLR_JAVA_MEM="-Xms256m -Xmx256m" -p 8983:8983 --name deployed_solr production_solr -f --user-managed
