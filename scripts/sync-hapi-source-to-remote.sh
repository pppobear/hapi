#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_TARGET:?DEPLOY_TARGET is required}"
: "${HAPI_DEPLOY_SOURCE_PATH:?HAPI_DEPLOY_SOURCE_PATH is required}"

ssh "$DEPLOY_TARGET" "install -d '${HAPI_DEPLOY_SOURCE_PATH}' '${HAPI_DEPLOY_SOURCE_PATH}/hub/tools/tunwg'"

rsync -az --delete --info=stats2 \
    --include='cli/tools/archives/difftastic-x64-linux.tar.gz' \
    --include='cli/tools/archives/ripgrep-x64-linux.tar.gz' \
    --include='cli/tools/archives/*-LICENSE' \
    --exclude='.git/' \
    --exclude='.github/' \
    --exclude='node_modules/' \
    --exclude='*/node_modules/' \
    --exclude='cli/dist-exe/' \
    --exclude='cli/tools/unpacked/' \
    --exclude='cli/tools/archives/*' \
    --exclude='hub/dist/' \
    --exclude='hub/tools/' \
    --exclude='web/dist/' \
    --exclude='docs/.vitepress/dist/' \
    --exclude='website/dist/' \
    ./ "$DEPLOY_TARGET:${HAPI_DEPLOY_SOURCE_PATH}/"

scp /tmp/tunwg/* "$DEPLOY_TARGET:${HAPI_DEPLOY_SOURCE_PATH}/hub/tools/tunwg/"
ssh "$DEPLOY_TARGET" "chmod 755 ${HAPI_DEPLOY_SOURCE_PATH}/hub/tools/tunwg/tunwg-*"
