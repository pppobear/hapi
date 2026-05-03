#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-/tmp/tunwg}"
base_url="https://github.com/tiann/tunwg/releases/latest/download"

mkdir -p "$output_dir"

curl -fsSL -o "$output_dir/tunwg-x64-linux" "$base_url/tunwg"
curl -fsSL -o "$output_dir/tunwg-arm64-linux" "$base_url/tunwg-arm64"
curl -fsSL -o "$output_dir/tunwg-x64-darwin" "$base_url/tunwg-darwin"
curl -fsSL -o "$output_dir/tunwg-arm64-darwin" "$base_url/tunwg-darwin-arm64"
curl -fsSL -o "$output_dir/tunwg-x64-win32.exe" "$base_url/tunwg.exe"
curl -fsSL -o "$output_dir/LICENSE" "https://raw.githubusercontent.com/tiann/tunwg/refs/heads/master/LICENSE"
