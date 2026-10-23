# Connect v0.3.0 控制台上线验证

2026-10-23 13:19（Asia/Shanghai）在 `adam@192.168.2.52` 完成部署，管理入口为
[Connect](https://edge.trinfo.net/connect/)。

## 版本与产物

- 固定 tag：`v0.3.0`；源码提交：`72e6e76195b8effa3f7ea8222c384cc38ae1b5a3`。
- [GitHub Release](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.0) 包含源码、额外网页构建包及 SHA-256。
- 源码归档：`f169125655f9326377f27bb6b56ad9df55982a06f711512e8569b16b8d5bd196`。
- 网页构建归档：`f1b63b7ac4e3dadb610378ec6b8fafc8470b2ebbbdfaee717e4938d5149138e3`。
- 部署目录：`/srv/tsuite-connect/releases/v0.3.0/`；`current` 已指向该目录。
- 本次实际固定源码位于发布目录的 `source/`。未修改服务器原 Git 工作区。
- 归档由固定 tag 与 lockfile 在干净目录执行 `npm ci`、TypeScript 检查与生产构建生成。

## 更新范围与兼容

更新控制机的 `tsuite-connect-console`、新增 `tsuite_connect_web.py`、静态资源和版本来源记录，
使用同一文件系统目录切换后重启 `tsuite-connect-console.service`。旧程序保留完整回退副本。

没有重启或更新 broker、Edge、SSH、客户/支持端程序，没有创建、关闭或修改客户支持会话。
配置、systemd unit/drop-in、固定身份文件字节摘要与 UID/GID/权限核验一致；4 个本地用户的
完整行指纹一致。更新前后 96 条 broker 会话记录逐字节一致，其中 3 个 enrolled 连接保持不变。

网页登录的新默认值为固定 7 天，配置未被重写。既有网页登录仍按原期限到期；重新登录后
采用新期限。客户 SSH 闲置租约和 15 分钟领取窗口保持不变。

## 验证结果

- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39904737866) 和
  [Windows CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39904737833) 均通过。
- 本地 122 项 Python 测试、3 个 Chromium 流程、TypeScript、干净生产构建、Python 编译及
  ShellCheck 通过。真实隔离 OpenSSH 验证通过认证、Edge 代理、跨会话及 Shell 拒绝、主机密钥、
  原生到期与撤销。没有使用生产会话做关闭验证。
- 已安装 Python 与静态文件摘要逐项匹配 `WEB_BUILD.json`。
- 公网 `/connect/` 返回 401 React 入口，JS/CSS 返回 200、no-store，摘要匹配固定构建。
  CSP 保留 self 限制，动态样式使用每响应独立 nonce。
- `/connect/api/bootstrap` 返回 200，匿名用户为空、组织为 `transinfosh`、登录期限为 604800 秒。
- Linux/Windows 支持客户端下载入口均返回 200、no-store。旧 `/support`、`/support/` 仍为 404。
- 以 60 秒非管理员临时网页会话验证真实列表/详情 API 为 200、用户管理 API 为 403；随后立即删除
  此临时网页登录，不创建本地用户或客户 SSH 会话。
- GitHub OAuth 跳转保留既有 `/support/auth/github/callback`，redirect_uri 与状态 Cookie 路径一致；
  本次生成的临时 OAuth state 已消费清除。没有进行真实 GitHub 账号授权。
- 控制台和 broker GC timer 为 active，部署后控制台 error 级日志无记录。

## 回退

备份目录：`/var/backups/tsuite-connect/20261023T051930Z-pre-v0.3.0-console/`，权限 0700。
包含旧运行程序、配置及 unit 回退副本与元数据；不复制 SSH 私钥或临时会话私钥。

必要时在控制机执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261023T051930Z-pre-v0.3.0-console/rollback.py
```

脚本恢复旧网页运行目录及 `current` 指针，重启控制台；不恢复或覆盖数据库、用户、会话状态和密钥。
更新过程已设置自动健康检查失败回退，本次健康检查通过，未触发回退。

## 验证边界

真实 GitHub 授权、真实客户关闭与物理手机操作未在线执行。不能将只读上线检查等同于这些场景的
生产验收；对应功能的隔离回归和说明见[控制台测试映射](../console/控制台-测试映射.md)。
