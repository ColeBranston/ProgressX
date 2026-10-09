#!/bin/bash
# One-time (and re-runnable) setup of the local SonarQube for ProgressX:
#   - replaces the default admin/admin password with a random one kept in ~/.progressx (mode 600)
#   - creates the "progressx" project (main branch) and "progressx-pr" (pull requests; the free
#     Community Build has no branch / PR analysis, so PRs get their own project instead of
#     overwriting main's history)
#   - creates the "ProgressX" quality gate and makes both projects use it
#   - makes an analysis token for CI and stores it in ~/.progressx/sonar-token (mode 600)
# Nothing secret is printed. Usage: bash ci/sonarqube/setup.sh
set -euo pipefail

SONAR=${SONAR_HOST_URL:-http://127.0.0.1:9000}
SECRETS=${PROGRESSX_SECRETS:-$HOME/.progressx}
mkdir -p "$SECRETS" && chmod 700 "$SECRETS"
PASSWORD_FILE="$SECRETS/sonarqube-admin-password"
TOKEN_FILE="$SECRETS/sonar-token"

until curl -fs "$SONAR/api/system/status" | grep -q '"status":"UP"'; do echo "waiting for SonarQube..."; sleep 5; done

if [ ! -s "$PASSWORD_FILE" ]; then
    (umask 077; python3 -c 'import secrets; print(secrets.token_urlsafe(24) + "Aa1!")' > "$PASSWORD_FILE")
fi
PASSWORD=$(cat "$PASSWORD_FILE")

# first run: swap the default password (a no-op afterwards, when admin/admin no longer works)
if curl -fs -u admin:admin "$SONAR/api/authentication/validate" | grep -q '"valid":true'; then
    printf '%s' "$PASSWORD" | curl -fs -u admin:admin -X POST "$SONAR/api/users/change_password" \
        --data-urlencode login=admin --data-urlencode previousPassword=admin --data-urlencode password@- >/dev/null
    echo "admin password set (stored in $PASSWORD_FILE)"
fi

# credentials reach curl through a config on stdin, never its command line
api() { local method=$1 path=$2; shift 2; printf 'user = "admin:%s"\n' "$PASSWORD" | curl -fsS -K - -X "$method" "$SONAR/api/$path" "$@"; }

# nothing is visible without signing in
api POST settings/set --data-urlencode key=sonar.forceAuthentication --data-urlencode value=true >/dev/null

for project in progressx progressx-pr; do
    if ! api GET "projects/search?projects=$project" | grep -q "\"key\":\"$project\""; then
        name=$([ "$project" = progressx ] && echo "ProgressX" || echo "ProgressX (pull requests)")
        api POST projects/create --data-urlencode "project=$project" --data-urlencode "name=$name" --data-urlencode visibility=private --data-urlencode mainBranch=main >/dev/null
        echo "created project $project"
    fi
done

# ---------- quality gate ----------
# Overall-code conditions (not "new code"): every analysis, PR or main, is judged on the whole code base.
# Ratchet the coverage floor up as tests are added.
GATE="ProgressX"
COVERAGE_MIN=${COVERAGE_MIN:-20}
if ! api GET qualitygates/list | grep -q "\"name\":\"$GATE\""; then
    api POST qualitygates/create --data-urlencode "name=$GATE" >/dev/null
fi
# start from a clean set of conditions so re-running applies the values below
for id in $(api GET "qualitygates/show?name=$GATE" | python3 -c 'import json,sys; print(" ".join(c["id"] for c in json.load(sys.stdin).get("conditions", [])))'); do
    api POST qualitygates/delete_condition --data-urlencode "id=$id" >/dev/null
done
condition() { api POST qualitygates/create_condition --data-urlencode "gateName=$GATE" --data-urlencode "metric=$1" --data-urlencode "op=$2" --data-urlencode "error=$3" >/dev/null; }
condition security_rating GT 1                      # no vulnerabilities (rating A)
condition reliability_rating GT 1                   # no bugs (rating A)
condition sqale_rating GT 1                         # maintainability rating A
condition security_hotspots_reviewed LT 100         # every security hotspot reviewed
condition coverage LT "$COVERAGE_MIN"               # overall line + branch coverage floor
condition duplicated_lines_density GT 5             # at most 5% duplicated lines
api POST qualitygates/set_as_default --data-urlencode "name=$GATE" >/dev/null
for project in progressx progressx-pr; do
    api POST qualitygates/select --data-urlencode "gateName=$GATE" --data-urlencode "projectKey=$project" >/dev/null
done
echo "quality gate '$GATE' applied (coverage >= $COVERAGE_MIN%)"

# ---------- CI token ----------
if [ ! -s "$TOKEN_FILE" ]; then
    api POST user_tokens/revoke --data-urlencode name=github-actions >/dev/null 2>&1 || true
    (umask 077; api POST user_tokens/generate --data-urlencode name=github-actions --data-urlencode type=GLOBAL_ANALYSIS_TOKEN \
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' > "$TOKEN_FILE")
    echo "analysis token stored in $TOKEN_FILE"
fi
echo "done: $SONAR (sign in as admin with the password in $PASSWORD_FILE)"
