#!/bin/bash
# Calls the local SonarQube web API as admin without the password ever appearing in a command line
# or in output. Usage: bash ci/sonarqube/api.sh GET "measures/component?component=progressx&metricKeys=coverage"
#                      bash ci/sonarqube/api.sh POST hotspots/change_status --data-urlencode hotspot=... 
set -euo pipefail
SONAR=${SONAR_HOST_URL:-http://127.0.0.1:9000}
PASSWORD_FILE=${PROGRESSX_SECRETS:-$HOME/.progressx}/sonarqube-admin-password
method=$1 path=$2; shift 2
# the credentials go to curl through a config on stdin, not argv
printf 'user = "admin:%s"\n' "$(cat "$PASSWORD_FILE")" | curl -sS --fail-with-body -K - -X "$method" "$SONAR/api/$path" "$@"
