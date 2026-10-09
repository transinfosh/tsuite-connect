# TSuite Connect 改名与原地迁移

产品与仓库由 TSuite Support / `transinfosh/tsuite-support` 改为
TSuite Connect / `transinfosh/tsuite-connect`。当前版本为 0.2.1；已有 v0.1.0 Tag 与归档保持不变。

## 2.52 控制服务

日常入口为 `https://edge.trinfo.net/connect/`，控制服务部署在 `adam@192.168.2.52`。

| 项目 | 当前名称 |
| --- | --- |
| 管理页面服务 | tsuite-connect-console.service |
| 私钥回收 | tsuite-connect-operator-gc.service / .timer |
| 服务账号 | tsuite-connect-console / tsuite-connect-operator |
| 程序 | /usr/local/lib/tsuite-connect-console |
| 配置 | /etc/tsuite-connect-console / /etc/tsuite-connect-control |
| 状态 | /var/lib/tsuite-connect-console / /var/lib/tsuite-connect-operator |
| 运维命令 | /usr/local/bin/tsuite-connect-console-action |
| 源码与版本 | /srv/tsuite-connect/repository / /srv/tsuite-connect/releases |

支持端命令及模块使用 Connect 名称，本机会话目录使用 tsuite-connect / TSuiteConnect，
再次连接脚本为 connect.py / connect.ps1。Linux 与原生 Windows 支持端均接受新 `/connect` 和旧 `/support` 授权地址。

## 兼容边界

旧 `/support/*` 由 Nginx/Caddy 转发到同一管理服务，已发出的下载及授权链接继续有效。
现有 GitHub OAuth App 的 Callback 保留 `/support/auth/github/callback`，在控制台配置的
`github_callback_url` 中保存；OAuth 状态 Cookie 按实际回调路径设置。新安装默认使用 `/connect/auth/github/callback`。
改名后的浏览器 Cookie 使用 Connect 名称，用户需要重新登录；用户、密码哈希、TOTP 和历史记录保留。

Edge 上的 `/tsuite-support/*` 接入下载、会话管理命令、客户机临时账户与 ProgramData/清理路径属于
既有协议，继续使用原名。仅品牌改名不能改变已安装客户机的清理协议。
2.52 的旧配置/状态/命令路径保留受限兼容符号链接；新服务实际从 Connect 目录运行。

## 迁移流程

从本仓库固定版本运行：

```bash
sudo control/migrate-connect.sh --check
sudo control/migrate-connect.sh --apply
```

检查必须确认没有未结束会话。迁移停止旧页面与 GC 写入，保存 root-only 本机回退副本，
关闭 broker 空闲的 SSH ControlPersist master 并确认账号不再持有进程后，
保持 UID/GID 后重命名账号、移动配置及状态、原子更新配置中的本地路径，保留代理 drop-in。
临时会话私钥目录不进入回退备份。目录及固定密钥沿用原权限。
随后校验 sudoers、执行 broker 自检、启动 Connect 服务并检查客户端下载入口。
备份存于 `/var/backups/tsuite-connect/<UTC时间>-rename/`，仅作本次维护回退副本；长期密钥备份仍需加密。

同时将共享 Nginx/Caddy 路由更新为接受 `/connect/*` 与旧 `/support/*`，校验配置后 reload。
旧 unit 在新服务启动成功后移除，避免重复启动。完整线上完成标准：新服务与 GC active、
新旧 HTTPS 页面返回 401、新旧客户端下载返回 200/no-store、broker 两条受限 SSH 通道自检通过。

回退时先停止 Connect 服务与 timer；按相反顺序恢复用户名和组名（保持数字 UID/GID），
解除旧路径符号链接并把真实目录移回，恢复备份的配置、sudoers、程序与旧 unit；
恢复代理配置，daemon-reload 后启用旧页面和 GC，再按同样方法核验。
会话状态目录原地保留，回退不得覆盖新产生的历史或客户数据。共享路由可独立恢复其维护前备份。

0.2.1 修复现场发现的 ControlPersist master 占用账号问题；账号重命名成功后才更改组名，降低失败时的中间状态。
