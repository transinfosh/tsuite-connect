# 控制服务安装

日常使用直接访问 `192.168.2.52` 上已部署的 TSuite Connect：
[支持管理页面](https://edge.trinfo.net/connect/)。现有环境无需再次安装；下述步骤用于新建环境或维护支持服务。

从固定版本检出本仓库；以下路径均相对于仓库根目录。不需要安装 `tsuite_deploy`。
堡垒机及控制服务目前面向 Ubuntu/systemd；日常支持终端可为 Linux 或原生 Windows PowerShell/OpenSSH。

## 依赖与顺序

堡垒机：Python 3、OpenSSH Server/Client、Caddy、sudo、curl、systemd；详见根 README 的堡垒机安装。
控制服务：Python 3（标准库）、OpenSSH Client、sudo、curl、qrencode、iproute2、systemd。
Ubuntu 控制服务安装依赖：

```bash
sudo apt-get install python3 openssh-client sudo curl qrencode iproute2
```

1. 在堡垒机运行 `sudo bastion/install.sh --bastion-host support.example.com --operator-user tunnel-user`。
2. 在控制服务机器准备受限 broker。Host Key 文件必须通过独立可信渠道核验：

```bash
sudo control/prepare-connect-access.sh \
  --bastion-host support.example.com \
  --bastion-host-key-file /secure/path/known_hosts \
  --operator-user adam
```

3. 将输出的两个公钥安全传到堡垒机，安装受限桥接：

```bash
sudo bastion/install-console-bridge.sh \
  --bridge-public-key /secure/path/bridge_ed25519.pub \
  --edge-operator-public-key /secure/path/edge_operator_ed25519.pub \
  --operator-user tsuite-operator
```

4. 创建 GitHub OAuth App：Homepage 为 `https://connect.example.com/connect/`，Callback 为
`https://connect.example.com/connect/auth/github/callback`，使用 `read:org` scope。Secret 通过 root-only 文件传入。

```bash
sudo control/install-connect-console.sh \
  --public-host support.example.com \
  --github-client-id YOUR_CLIENT_ID \
  --github-client-secret-file /secure/path/github-client-secret \
  --github-allowed-org YOUR_ORG
```

需要本地账号密码加 TOTP 时，同时提供 `--local-admin-user`、`--local-admin-password-file`、
`--local-admin-totp-secret-file`。首次安装仍需要 OAuth 配置；升级可省略 Secret 文件以沿用现有配置。
安装器默认直接访问 GitHub；受限网络可显式传入 `--https-proxy http://127.0.0.1:18080`。
安装器只管理支持服务，直接检查 `127.0.0.1:8765/` 返回 401，不要求 Nginx 或 FRP。

## HTTPS 路由

控制台仅监听控制服务机器的 `127.0.0.1:8765`，应通过受保护的传输送到堡垒机回环端口。
可用已有 FRP，也可用单独 SSH 反向隧道；传输身份由运维单独配置，不能复用会话 broker 身份或开放任意代理权限。
例如将控制服务回环 8765 映射到堡垒机回环 18765 后，在堡垒机现有支持域名的站点块中添加：

```caddy
handle_path /connect/* {
    reverse_proxy 127.0.0.1:18765
}
```

默认堡垒机安装器会导入 `/etc/caddy/tsuite-connect-console-routes.caddy`，可将上述路由写入该文件。
校验 `sudo caddy validate --config /etc/caddy/Caddyfile` 后再 reload Caddy。
保留 `/tsuite-support/*` 静态接入路由，不得缓存含凭据的响应。公网 `/connect/` 未登录应为 401。
现有 `tsuite_deploy` 环境继续使用其 FRP/Nginx/Caddy 配置，不需要改端口或路由。

## 权限兼容

Web 只允许 create/set-platform/show/list/close/claim；broker 用户持有私钥，Web 用户不可读取。
只有运维用户可执行 ssh/run/force-close。prepare 安装器沿用历史 sudoers 文件名
`/etc/sudoers.d/tsuite-deploy-operator`，防止原地升级重复定义别名；该文件名不代表代码依赖。
新安装仅授权重启支持页面。维护既有 2.52 共享部署机时，可在本仓库直接运行 prepare 安装器，
显式传入 `--deployment-service-permissions`，保留 nginx/frpc/github-egress 的精确重启权限；
安装页面时显式传入 `--https-proxy http://127.0.0.1:18080` 以沿用其出站代理。
日常业务部署直接使用现有服务，无需执行这些安装步骤。
