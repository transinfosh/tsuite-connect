# Connect v0.3.4 旧连接冲突提示验证

## 修复范围

用户已自行处理报错机器的旧连接；本轮仅补全冲突提示，显示旧连接 ID、客户环境名称以及
在 Connect“远程会话”查找关闭的指引。没有修改自动清理条件、状态流转、协议、权限或新授权消费。

固定 tag：`v0.3.4`，源码：`bdb57805527c78fea6dafa059db73e6a7230a31b`。
[Release](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.4) 提供源码及 SHA-256：
`3233797fb6d1752f0a2ab30a910459dd4462fa9e4e2da84331c69325670b8185`。
本次不包含网页构建包，网页界面未修改。

## 验证

- 新增 `test_active_session_error_identifies_the_connection_to_close`：修复前缺少旧 ID 失败，
  修复后 ID、名称和关闭入口断言通过，同时确认旧状态不变、新授权仍为 issued、提示不含 token。
- 本地 123 项 Python 测试及 Python 编译通过。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39911183203) 通过构建、
  123 项 Python、13 个浏览器流程、隔离 OpenSSH、语法与 ShellCheck。
- 可选 Ruff 检查与修复前同为六项既有诊断，无新增；未扩大本轮修改去调整无关代码。
- Windows 运行时代码未改，未触发 Windows CI。

## 线上部署

2026-10-23 14:50（Asia/Shanghai）通过用户指定的 `adam@192.168.2.50` 跳板，
以既有 `ubuntu@edge.trinfo.net` 管理入口完成更新。继续使用受信部署配置的 Host Key，
保持 StrictHostKeyChecking=yes，没有新增 SSH 身份或权限。

- 目标：`/usr/local/lib/tsuite-support/tsuite-support-session`，原有命令软链接不变。
- 原文件与 v0.3.3 中同文件摘要一致：
  `eaa9f801c11fd44a1abc040d4319cea4e5c0f30383cbb0b1e4d43349763f3ca3`。
- 新文件从已发布源码包中提取，摘要逐项确认：
  `e58bc994c9282437ec306a3b57ac82319a625725d954805782ba4bf504de24c3`。
- 替换前备份，原子替换后保持 root:root 0755；无需重启服务，后续接入校验使用新脚本。
- 使用实际已安装模块，在独立临时目录创建合成会话数据，触发冲突并断言旧 ID、名称、
  “远程会话”指引可见、token 不输出，前后合成会话内容完全一致。
- 更新前后 101 条真实会话列表逐字节一致，其中 3 条 enrolled；没有创建、关闭或修改客户会话。
- 受保护的管理配置、Caddy 配置、GC unit 和 SSH 公共 Host Key 的摘要、UID/GID、权限一致；
  GC timer 和 Caddy 均 active。没有修改私钥或用户账号。
- 公网控制台匿名 401，JS/CSS 200、no-store 并匹配既有 v0.3.3 网页构建；bootstrap 与
  两个客户端下载正常，旧页面入口仍 404。网页版本保持 v0.3.3，本次独立更新 Edge 管理脚本。

## 回退与验证边界

备份：`/var/backups/tsuite-connect/20261023T065014Z-pre-v0.3.4-edge/`，权限 0700。
保留旧脚本、会话清单、元数据及部署结果，没有备份 SSH 私钥或短期授权。必要时执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261023T065014Z-pre-v0.3.4-edge/rollback.py
```

脚本只恢复旧程序，不覆盖数据库、会话、密钥或配置；失败自动回退未触发。
真实客户机器已经由用户处理完成，本次没有在生产客户上主动制造冲突或重装客户端。
终端信息通过本地/CI 回归及 Edge 实际安装模块的隔离数据验证。
