# TSuite Connect 维护说明

本仓库负责临时 SSH 支持会话、管理页面、受限 broker、客户接入及 Linux/Windows 支持端。

- 修改或部署前阅读 [README](README.md)；涉及安装、发布、线上维护时完整阅读 [运维手册](docs/operations.md)。
- 修改协议、权限或会话状态时，检查 bastion、console、customer、operator 四端的兼容性；同步对应测试和 README。
- 使用隔离临时目录及本机独立 sshd 做验证。生产会话、系统账号、密钥和配置只能通过明确的维护任务修改。
- 当前 Connect 控制服务使用 `/etc/tsuite-connect-*`、`/var/lib/tsuite-connect-*` 和同名前缀的 unit；品牌迁移按 [改名说明](docs/rename-connect.md) 执行，保留 UID/GID、密钥、用户与会话数据及旧接入协议。
- 私钥、OAuth Secret、TOTP 密钥、一次性接入凭据不提交、不输出到普通日志。不关闭 Host Key 校验，不扩大 Web 服务的 sudo 权限。
- 发布使用不可移动的 `v<version>` tag，版本与 VERSION 一致；发布源码归档及 SHA-256。支持服务由本仓库独立升级，业务部署直接使用现有服务。
- 完成条件：相关 Python/Shell 检查通过；Windows 改动还需 Windows CI 通过；文档如实说明验证边界。线上维护需核验服务与 HTTPS 入口。
