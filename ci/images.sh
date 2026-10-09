#!/bin/bash
# The images ProgressX ships, all tagged with the commit they were built from:
#   ghcr.io/colebranston/progressx-app:<sha>             (Next.js app, progressx/dockerfile)
#   ghcr.io/colebranston/progressx-search-backend:<sha>  (FastAPI search backend)
# Usage: ci/images.sh build <sha> | push <sha> | names <sha>
# Images are built from a clean checkout with no env files, so nothing secret can end up inside them.
set -euo pipefail
action=$1 sha=$2
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "need a full commit sha" >&2; exit 1; }
REGISTRY=${IMAGE_REGISTRY:-ghcr.io/colebranston}
SOURCE=https://github.com/ColeBranston/ProgressX
cd "$(dirname "$0")/.."

# name  context  dockerfile
IMAGES=(
  "progressx-app progressx progressx/dockerfile"
  "progressx-search-backend data/search_backend data/search_backend/Dockerfile"
)

for entry in "${IMAGES[@]}"; do
  read -r name context dockerfile <<<"$entry"
  image="$REGISTRY/$name:$sha"
  case $action in
    names) echo "$image" ;;
    build)
      docker build --pull --file "$dockerfile" --tag "$image" \
        --label "org.opencontainers.image.source=$SOURCE" \
        --label "org.opencontainers.image.revision=$sha" \
        "$context" ;;
    push)
      docker push "$image"
      # "main" always points at the newest image that passed CI on main
      docker tag "$image" "$REGISTRY/$name:main"
      docker push "$REGISTRY/$name:main" ;;
    *) echo "unknown action $action" >&2; exit 1 ;;
  esac
done
