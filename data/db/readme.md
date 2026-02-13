# Current Main Docker Run Command

docker run --rm -v "$PWD/var/solr:/var/solr" -p 8983:8983 --name local_solr solr

# Create A Core

docker run --rm -v "$PWD/var/solr:/var/solr" -p 8983:8983 --name local_solr solr solr-precreate {core_name}
