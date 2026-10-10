#!/bin/bash
# Gives a CI job its own Docker client config and prints its folder (the workflow exports it as
# DOCKER_CONFIG). With REGISTRY_USER and REGISTRY_TOKEN set (the job's short-lived GITHUB_TOKEN), it
# also holds the ghcr.io login.
#
# Why not `docker login`: on macOS, a config without saved logins makes Docker fall back to the
# Keychain, which a background service (the runner) can't use ("User interaction is not allowed").
# Writing the login into this config means Docker never looks for the Keychain. The file is mode 600
# in the job's temp folder, which the runner deletes when the job ends.
set -euo pipefail
dir="${RUNNER_TEMP:?run inside GitHub Actions}/docker-config"
mkdir -p "$dir" && chmod 700 "$dir"
cp -R "$HOME/.docker/contexts" "$dir/" 2>/dev/null || true
context="$(docker context show)"
(umask 077; CONTEXT="$context" python3 - "$dir/config.json" <<'PY'
import base64, json, os, sys
config = {
    "currentContext": os.environ["CONTEXT"],
    "cliPluginsExtraDirs": ["/Applications/Docker.app/Contents/Resources/cli-plugins", os.path.expanduser("~/.docker/cli-plugins")],
}
user, token = os.environ.get("REGISTRY_USER"), os.environ.get("REGISTRY_TOKEN")
if user and token:
    config["auths"] = {"ghcr.io": {"auth": base64.b64encode(f"{user}:{token}".encode()).decode()}}
json.dump(config, open(sys.argv[1], "w"))
PY
)
echo "$dir"
