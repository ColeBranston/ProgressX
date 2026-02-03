# Current Main Docker Run Command

docker run --name local_solr -p 8983:8983 -v ${PWD}\var\solr\data:/var/solr/data solr

# Create A Core

docker run --name local_solr -p 8983:8983 -v ${PWD}\var\solr\data:/var/solr/data solr solr-precreate {core_name}