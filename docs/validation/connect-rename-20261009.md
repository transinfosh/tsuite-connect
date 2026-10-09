# TSuite Connect 改名上线验证（2026-10-09）

## 交付

- 仓库：[transinfosh/tsuite-connect](https://github.com/transinfosh/tsuite-connect)。
- 上线版本：`v0.2.2`，源码 `99fa28e5600d4b5611556fe381653e2963aae211`。
- 归档 SHA-256：`f0c3547d5759370e4ab3fb216adbd12c9f27f1bc612432be429afc5e46cec968`。
- 管理入口：`https://edge.trinfo.net/connect/`；旧 `/support/*` 与既有 GitHub 回调兼容。
- 控制机：`adam@192.168.2.52`；Connect 服务账号、服务、程序、配置及状态目录已迁移到新名称。
- Edge 只更新 Caddy 路由；既有客户接入与清理协议保留。详见 [改名说明](../rename-connect.md)。

## 验证证据

- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/37914333727)：103 项测试、ShellCheck、真实隔离 SSH 证书/代理集成通过。
- [Windows CI](https://github.com/transinfosh/tsuite-connect/actions/runs/37913302952)：原生 PowerShell 5.1、ACL、二进制转发、生命周期及 OpenSSH 8.1/9.8.3 认证通过。后续 0.2.1/0.2.2 只修复 Linux 迁移脚本，Windows 运行时代码未再变更。
- 线上迁移前后比对：UID/GID、固定密钥字节与权限、OAuth/本地认证配置、3 个用户、79 条历史会话、实际代理 drop-in 均保持一致。
- 已安装的 console/broker/portable/activity/Windows/C# 文件与固定归档逐字节一致。
- 通过可回收的临时 Web 登录记录验证真实已认证 Connect 工作台与 Web → broker sudo 权限；验证后删除该临时 Web 登录记录。
- 实际 OAuth 登录跳转的 redirect_uri 和状态 Cookie 路径均匹配既有 `/support/auth/github/callback`；验证后消费本次生成的 OAuth 状态。
- 公网新旧页面均返回 401、显示 TSuite Connect；新旧 Linux/Windows 支持客户端下载均返回 200 和 `Cache-Control: no-store`。
- Nginx 与 Caddy 完整配置验证通过并已 reload；broker `self-test` 的两条受限 SSH 通道通过。
- 没有创建或关闭客户会话，79 条历史输出逐字节一致。真实客户新会话未在线创建；SSH/Windows 生命周期由隔离测试验证。

## 备份与现场修复

- 控制机路由备份：`/var/backups/tsuite-connect/20261009T094944Z-routes/`。
- Edge 路由备份：`/var/backups/tsuite-connect/20261009T094945Z-routes/`。
- 最终服务迁移备份：`/var/backups/tsuite-connect/20261009T095649Z-rename/`。
- 账号首次迁移被闲置 ControlPersist 进程阻止时已恢复原服务；0.2.1 增加进程排空。
- 0.2.2 为 HTTP 就绪检查增加有界重试；已在实际主机再次执行迁移并验证成功。
- 回退副本仅作本机维护恢复，权限受限；临时会话私钥目录未进入备份。
