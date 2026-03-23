#!/usr/bin/env bash
set -euo pipefail

release_name="${1:?release name required}"
incoming_bin="${2:?incoming binary path required}"

deploy_root="${HAPI_DEPLOY_ROOT:-$HOME/.local/share/hapi-deploy}"
keep_releases="${HAPI_DEPLOY_KEEP_RELEASES:-5}"
restart_runner="${HAPI_DEPLOY_RESTART_RUNNER:-true}"

incoming_dir="$deploy_root/incoming"
releases_dir="$deploy_root/releases"
current_link="$deploy_root/current"
release_dir="$releases_dir/$release_name"

mkdir -p "$incoming_dir" "$releases_dir"

if [[ ! -f "$incoming_bin" ]]; then
    echo "incoming binary not found: $incoming_bin" >&2
    exit 1
fi

previous_target=""
if [[ -L "$current_link" || -e "$current_link" ]]; then
    previous_target="$(readlink -f "$current_link" 2>/dev/null || true)"
fi

rollback() {
    local exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        return
    fi

    echo "deploy failed; attempting rollback" >&2
    if [[ -n "$previous_target" && -d "$previous_target" ]]; then
        ln -sfn "$previous_target" "$current_link"
        systemctl --user daemon-reload || true
        systemctl --user restart hapi-hub || true
        if [[ "$restart_runner" == "true" || "$restart_runner" == "1" ]]; then
            systemctl --user restart hapi-runner || true
        fi
    fi
}
trap rollback EXIT

mkdir -p "$release_dir"
install -m 0755 "$incoming_bin" "$release_dir/hapi"
ln -sfn "$release_dir" "$current_link"

systemctl --user daemon-reload
systemctl --user restart hapi-hub

if [[ "$restart_runner" == "true" || "$restart_runner" == "1" ]]; then
    systemctl --user restart hapi-runner
fi

echo "active release: $release_dir"
systemctl --user --no-pager --full status hapi-hub | sed -n '1,16p'

if [[ "$restart_runner" == "true" || "$restart_runner" == "1" ]]; then
    printf '\n---\n'
    systemctl --user --no-pager --full status hapi-runner | sed -n '1,16p'
fi

if [[ "$keep_releases" =~ ^[0-9]+$ ]] && (( keep_releases > 0 )); then
    mapfile -t old_releases < <(ls -1dt "$releases_dir"/* 2>/dev/null | tail -n +"$((keep_releases + 1))" || true)
    if (( ${#old_releases[@]} > 0 )); then
        rm -rf "${old_releases[@]}"
    fi
fi

rm -f "$incoming_bin"
trap - EXIT
