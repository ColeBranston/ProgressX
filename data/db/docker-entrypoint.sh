#!/bin/bash
set -e

# Fix volume ownership (first start only, harmless otherwise)
chown -R solr:solr /var/solr

# If cores already exist, just start Solr
if [ -d "/var/solr/data/raw_ingestion_data" ]; then
  echo "Solr cores already exist, starting Solr"
  exec gosu solr solr-foreground
fi

echo "Starting Solr temporarily to create cores..."

# Start Solr in the background
gosu solr solr start -p 8983 -s /var/solr -force

# Create cores using supported CLI
gosu solr solr create_core -c raw_ingestion_data -d _default
gosu solr solr create_core -c clean_ingestion_data -d _default

# Stop the temporary Solr
gosu solr solr stop -p 8983

echo "Cores created, starting Solr normally"

exec gosu solr solr-foreground
