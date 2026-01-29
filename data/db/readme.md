# Current Main Docker Command

docker run -v "$PWD/solrdata:/var/solr" -p 8983:8983 --name local_solr solr

# Create A Core

docker run -v "$PWD/solrdata:/var/solr" -p 8983:8983 --name local_solr solr solr-precreate {core_name}
