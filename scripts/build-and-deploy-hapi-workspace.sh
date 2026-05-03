#!/usr/bin/env bash
set -euo pipefail

: "${HAPI_DEPLOY_ROOT:?HAPI_DEPLOY_ROOT is required}"
: "${HAPI_DEPLOY_KEEP_RELEASES:?HAPI_DEPLOY_KEEP_RELEASES is required}"
: "${HAPI_DEPLOY_RESTART_RUNNER:?HAPI_DEPLOY_RESTART_RUNNER is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

export PATH="$HOME/.bun/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:$PATH"

source_path="${HAPI_DEPLOY_SOURCE_PATH:-${HAPI_DEPLOY_ROOT}/workspace}"
deps_fingerprint_path="${source_path}/.deploy-deps.sha256"

cd "$source_path"

current_deps_fingerprint="$(
    sha256sum \
        package.json \
        bun.lock \
        cli/package.json \
        hub/package.json \
        shared/package.json \
        web/package.json \
        website/package.json \
        docs/package.json | sha256sum | awk '{print $1}'
)"
previous_deps_fingerprint="$(cat "$deps_fingerprint_path" 2>/dev/null || true)"

if [[ ! -d node_modules || "$current_deps_fingerprint" != "$previous_deps_fingerprint" ]]; then
    echo "Dependency fingerprint changed; running bun install"
    bun install
    printf '%s\n' "$current_deps_fingerprint" > "$deps_fingerprint_path"
else
    echo "Dependency fingerprint unchanged; skipping bun install"
fi

bun run build:single-exe

binary_path="$source_path/cli/dist-exe/bun-linux-x64-baseline/hapi"
test -x "$binary_path"

HAPI_DEPLOY_ROOT="$HAPI_DEPLOY_ROOT" \
HAPI_DEPLOY_KEEP_RELEASES="$HAPI_DEPLOY_KEEP_RELEASES" \
HAPI_DEPLOY_RESTART_RUNNER="$HAPI_DEPLOY_RESTART_RUNNER" \
    bash scripts/deploy-hapi-release.sh "$GITHUB_SHA" "$binary_path"
