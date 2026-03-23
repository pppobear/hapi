#!/usr/bin/env bash
set -euo pipefail

hub_mode="--no-relay"
if [[ "${1:-}" == "--relay" ]]; then
    hub_mode="--relay"
fi

service_dir="$HOME/.config/systemd/user"
config_dir="$HOME/.config/hapi"
deploy_root="${HAPI_DEPLOY_ROOT:-$HOME/.local/share/hapi-deploy}"

mkdir -p "$service_dir" "$config_dir" "$deploy_root/releases"

hub_service="$service_dir/hapi-hub.service"
runner_service="$service_dir/hapi-runner.service"

if [[ -f "$hub_service" ]]; then
    cp "$hub_service" "$hub_service.bak.$(date +%Y%m%d%H%M%S)"
fi

if [[ -f "$runner_service" ]]; then
    cp "$runner_service" "$runner_service.bak.$(date +%Y%m%d%H%M%S)"
fi

cat > "$hub_service" <<EOF
[Unit]
Description=HAPI Hub
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/.local/share/hapi-deploy/current
EnvironmentFile=-%h/.config/hapi/hub.env
ExecStart=/bin/bash -lc 'export PATH="\$HOME/.local/bin:\$HOME/.npm-global/bin:\$HOME/.bun/bin:/usr/local/bin:/usr/bin:\$PATH"; exec "\$HOME/.local/share/hapi-deploy/current/hapi" hub ${hub_mode}'
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

cat > "$runner_service" <<'EOF'
[Unit]
Description=HAPI Runner
After=network.target hapi-hub.service

[Service]
Type=simple
WorkingDirectory=%h/.local/share/hapi-deploy/current
EnvironmentFile=-%h/.config/hapi/runner.env
ExecStart=/bin/bash -lc 'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:$PATH"; exec "$HOME/.local/share/hapi-deploy/current/hapi" runner start --foreground'
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

if [[ ! -f "$config_dir/hub.env" ]]; then
    cat > "$config_dir/hub.env" <<'EOF'
# Required for stable authentication. The hub will generate one on first boot if omitted.
# CLI_API_TOKEN=replace-me
#
# Optional but typical for public access / Telegram:
# HAPI_PUBLIC_URL=https://your-hapi.example.com
# TELEGRAM_BOT_TOKEN=123456:replace-me
EOF
fi

if [[ ! -f "$config_dir/runner.env" ]]; then
    cat > "$config_dir/runner.env" <<'EOF'
# Usually enough when the runner is on the same machine as the hub.
# HAPI_API_URL=http://127.0.0.1:3006
# CLI_API_TOKEN=replace-me
EOF
fi

systemctl --user daemon-reload
systemctl --user enable hapi-hub hapi-runner

cat <<EOF
Installed user services:
  $hub_service
  $runner_service

Edit these env files before the first start if needed:
  $config_dir/hub.env
  $config_dir/runner.env

Then start:
  systemctl --user start hapi-hub
  systemctl --user start hapi-runner
EOF
