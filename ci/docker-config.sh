#!/bin/bash
# Gives a CI job its own Docker client config, so `docker login ghcr.io` with the job's short-lived
# GITHUB_TOKEN never lands in this Mac's keychain or ~/.docker, and goes away with the job.
# Prints the folder; the workflow exports it as DOCKER_CONFIG.
set -euo pipefail
dir="${RUNNER_TEMP:?run inside GitHub Actions}/docker-config"
mkdir -p "$dir"
cp -R "$HOME/.docker/contexts" "$dir/" 2>/dev/null || true
cat > "$dir/config.json" <<JSON
{
  "currentContext": "$(docker context show)",
  "cliPluginsExtraDirs": ["/Applications/Docker.app/Contents/Resources/cli-plugins", "$HOME/.docker/cli-plugins"]
}
JSON
echo "$dir"
