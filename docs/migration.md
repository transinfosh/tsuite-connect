# 从 tsuite_deploy 拆分

2026-10-09 从公开仓库 [transinfosh/tsuite_deploy](https://github.com/transinfosh/tsuite_deploy)
的 `ef5933994f319f372fe65836def0900da83fe115` 提取支持工具及相关 Git 历史。
仅新仓库进行路径过滤；原仓库历史不重写。

| 原路径 | 独立仓库路径 |
| --- | --- |
| support-session/bastion | bastion |
| support-session/console | console |
| support-session/customer | customer |
| support-session/operator | operator |
| support-session/tests | tests |
| control-node/prepare-support-access.sh | control/prepare-support-access.sh |
| control-node/install-support-console.sh | control/install-support-console.sh |
| support-session/README.md | README.md |
| docs/validation/support-*.md | docs/validation/support-*.md |

支持工具的 Linux 与 Windows CI 迁入本仓库。业务镜像构建、Ansible、FRP 传输、混合 Nginx/Caddy
路由继续由 `tsuite_deploy` 管理。原控制机两个安装入口变为固定 Release 加 SHA-256 的调用包装器，
不再保存运行时副本；支持工具源代码的旧路径迁至上表位置。

安装器改为从本仓库读取源码；控制台默认直接联网，代理显式配置；健康检查直接访问 8765，
不再依赖部署机 nginx/frpc/github-egress。部署仓库兼容入口保留原代理和精确服务维护权限。
同时修复重传 OAuth Secret 时读取已有本地管理员配置的未初始化变量，保持升级后本地账号有效。

会话协议、HTTP 路径、installed commands、systemd unit、配置目录、状态目录及身份均保持原名。
服务端和两端客户端的运行时源码与提取前逐字节相同。本次源码拆分无需数据库迁移或重启线上服务。
历史验证记录保留原日期、原 commit 和原部署路径，不能视为新版本的线上部署证据。
