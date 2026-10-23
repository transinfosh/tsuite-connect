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

## 线上状态与边界

2026-10-23 此版本尚未部署到 Edge。控制机只读配置确认，实际接入校验位于 edge.trinfo.net，
仅更新 192.168.2.52 的网页控制台不能使该提示生效。当前可用身份不具备 Edge 管理员 SSH 访问权限，
已经向用户请求现有管理员连接账号/别名或已保存的专用密钥路径，没有请求私钥/密码内容。

没有创建、关闭、替换客户会话，没有修改服务器程序、配置、密钥或权限。既有受信 Host Key
保持严格校验。待获得原有管理入口后，仅更新堡垒机管理脚本中的提示；应先核对摘要并备份，
保持会话与密钥不变，再进行隔离或只读验证。
