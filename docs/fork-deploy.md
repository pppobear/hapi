# Fork-only Hub Deploy

这套部署文件只放在 `deploy-infra` 分支，不要从这个分支给 `upstream` 提 PR。

## GitHub 仓库变量

- `HAPI_DEPLOY_HOST`
  - 建议填 Tailscale 主机名，例如 `devfedora.tailxxx.ts.net`
- `HAPI_DEPLOY_USER`
  - 默认 `enoch`
- `HAPI_DEPLOY_ROOT`
  - 默认 `/home/enoch/.local/share/hapi-deploy`
- `HAPI_DEPLOY_KEEP_RELEASES`
  - 默认 `5`
- `HAPI_DEPLOY_REPO_PATH`
  - 默认 `/home/enoch/projects/hapi`

## GitHub Secrets

- `TS_OAUTH_CLIENT_ID`
- `TS_AUDIENCE`
- `HAPI_DEPLOY_SSH_KEY`

`TS_OAUTH_CLIENT_ID` 与 `TS_AUDIENCE` 对应 Tailscale GitHub Action 的 workload identity federation 配置。

## Tailscale 要求

- 创建 tag：`tag:ci`
- ACL 允许 `tag:ci` 访问目标机器的 `22` 端口
- 目标机 `192.168.5.23` 已加入 tailnet

## 远端初始化

在 `192.168.5.23` 上执行一次：

```bash
cd ~/projects/hapi
bash scripts/install-hapi-user-services.sh --relay
```

或如果你只需要本地/Tailscale 访问：

```bash
cd ~/projects/hapi
bash scripts/install-hapi-user-services.sh
```

然后编辑：

- `~/.config/hapi/hub.env`
- `~/.config/hapi/runner.env`

至少确认：

- `CLI_API_TOKEN`
- `HAPI_PUBLIC_URL`
- `TELEGRAM_BOT_TOKEN`（如果你要 Telegram）

最后启动：

```bash
systemctl --user start hapi-hub
systemctl --user start hapi-runner
```

## 工作流行为

`deploy-hub.yml` 会：

1. checkout `deploy-infra` 分支
2. 通过 Tailscale 连到目标机器
3. 远端 `git fetch` 目标 ref
4. 远端创建临时 worktree
5. 远端 `bun install --frozen-lockfile`
6. 远端 `bun run build:single-exe`
7. 远端调用 `scripts/deploy-hapi-release.sh`
8. 切换 `current` 软链并重启 `hapi-hub`
9. 按需重启 `hapi-runner`

远端发布目录：

- `/home/enoch/.local/share/hapi-deploy/releases/<git-sha>/hapi`
- `/home/enoch/.local/share/hapi-deploy/current`
