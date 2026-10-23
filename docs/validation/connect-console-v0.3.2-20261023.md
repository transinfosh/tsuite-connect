# Connect v0.3.2 即时导航上线验证

2026-10-23 13:56（Asia/Shanghai）部署至 `adam@192.168.2.52`，入口为
[Connect](https://edge.trinfo.net/connect/)。

## 原因与修复

v0.3.1 导航函数先 await 目标数据，再提交路由，导致用户从用户管理返回远程会话时有停顿。
阻塞 `/api/sessions` 的回归在修复前失败：请求未释放时 1 秒内仍看不到远程会话标题。

现改为立即切换页面框架与地址，再由独立读请求加载数据。已读取的列表只保留在当前登录的
React 内存中，返回时立即显示并后台刷新；首次访问显示官方 Skeleton。详情刷新保留原内容，
切换不同详情时清除旧详情。读请求不占用变更操作锁，加载时仍能导航；路由序号和身份检查
防止旧响应数据或无关错误覆盖新页面。退出和身份过期清理列表及一次性授权内存。

保留 v0.3.1 的默认 Neutral 主题、紧凑布局和过渡动画。本次不修改后端、API 签名、权限、数据库、
Cookie、SSH 协议或 Windows 客户端。

## 版本和产物

- 固定 tag：`v0.3.2`，源码提交：`57372d9d7da5b478a80b625e6159ba976ecfc891`。
- [GitHub Release](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.2) 包含源码、网页构建包和 SHA-256。
- 源码归档：`698f5f08cd77ce11aad3b22741ff11d13a1c51a1c0c72f944443ff92fff48117`。
- 网页归档：`9a9d933ad26ef7e669e5a6ad97f8deb6fc2431e97ba29f6648d188064fdde641`。
- 固定 tag 干净目录通过 npm ci、TypeScript 与生产构建；WEB_BUILD.json 记录来源及各文件摘要。
- `/srv/tsuite-connect/current` 已指向 `/srv/tsuite-connect/releases/v0.3.2`。

## 验证

- 9 个 Chromium 流程通过，包括请求屏障未释放时页面和 URL 已切换、列表内存数据可见、
  首次用户/详情骨架、加载中继续导航、过时用户请求错误隔离、迟到详情不覆盖新会话。
  既有登录、真实本地 TOTP、创建、关闭失败重试、系统切换、用户邀请、退出、焦点、CSP、
  过渡时长与减少动画回归通过。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39908352707) 通过构建、
  9 个浏览器流程、122 项 Python 测试、隔离 OpenSSH、语法和 ShellCheck。
  Windows 客户端未改动，未触发 Windows CI。
- 公网 JS/CSS 200、no-store，内容摘要逐项匹配固定构建；匿名首页 401、bootstrap 200、
  登录期限 604800 秒、组织 transinfosh；两个客户端入口 200，旧页面入口保持 404。
- 临时非管理员网页身份只读验证列表/详情为 200、用户管理为 403，验证后立即删除临时会话。
  OAuth 跳转回调与状态 Cookie 路径一致，探针产生的 state 已清理；未执行真实 GitHub 授权。
- 仅重启网页控制台，服务与 GC timer active，部署后控制台 error 级日志无记录。
  配置、unit/drop-in、固定身份文件的摘要与权限一致，4 个本地用户完整行指纹一致，
  部署前后全部 broker 会话记录一致；未创建、关闭或修改客户 SSH 会话。

## 回退和边界

备份：`/var/backups/tsuite-connect/20261023T055611Z-pre-v0.3.2-console/`，权限 0700，
不包含 SSH 私钥或短期会话私钥。回退命令：

```bash
sudo python3 /var/backups/tsuite-connect/20261023T055611Z-pre-v0.3.2-console/rollback.py
```

恢复旧网页运行目录和 current 指针，只重启控制台，不覆盖数据库和客户会话。
自动健康检查通过，未触发回退。Firefox、Safari、物理手机和真实客户关闭未实机验收；
业务场景与覆盖范围见[测试映射](../console/控制台-测试映射.md)。
