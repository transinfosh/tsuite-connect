# Connect v0.3.1 紧凑界面与过渡上线验证

2026-10-23 13:43（Asia/Shanghai）部署至 `adam@192.168.2.52`，入口为
[Connect](https://edge.trinfo.net/connect/)。

## 版本与产物

- 固定 tag：`v0.3.1`；源码提交：`1bb9a3ccc7b4a14b889c1560368d22b928a1d4bd`。
- [GitHub Release](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.1) 包含源码、网页构建包及 SHA-256。
- 源码归档：`6bef606e25071c7d1924d26d0b5b36dc639624abbfc17d49cc11cf927395a5c2`。
- 网页构建归档：`abc950ca2e2875b2dce6069e907f911841dd0685e60f33b8ed2d3e2ca4221449`。
- 部署目录：`/srv/tsuite-connect/releases/v0.3.1/`，`current` 指针已更新。
- 从固定 tag 导出干净源码，使用 lockfile 执行 npm ci、TypeScript 与生产构建。
  `WEB_BUILD.json` 固定源码提交及运行文件摘要。

## 更新行为

采用 shadcn/ui 默认 Neutral 主题与官方 Card、Tabs、Table、NavigationMenu，移除原有
手写布局及配色 CSS。页面布局使用标准 Tailwind 间距和响应式工具类，收紧页边距、工具栏、
表格行和卡片间距；手机顶栏导航保持文字不拆行。

页面切换先准备目标数据，加载期间保留当前页面并显示进度；详情刷新保留原内容。
页面、状态筛选与系统切换在支持 View Transitions 的浏览器使用短过渡；弹窗与菜单保留
组件自带动画。系统减少动画偏好关闭过渡，不支持该 API 时仍可正常操作。

本次未修改后端、接口、数据库、登录有效期、SSH 协议和 Windows 客户端。运行目录原子切换后
只重启网页控制台；配置、unit/drop-in、固定身份文件的摘要和权限一致，4 个本地用户完整行
指纹一致，全部 broker 会话记录与部署前一致。没有创建、关闭或修改客户连接，2 个已连接会话
在部署后仍为 enrolled。

## 验证结果

- 本地 122 项 Python 测试、7 个 Chromium 流程、TypeScript 与干净生产构建通过。
- 导航与详情刷新通过延迟 API 验证：等待期间原内容保留，两个闪动用例修复前失败、修复后通过。
- 浏览器捕获实际动画并验证时长不超过 200ms；模拟减少动画后不调用 View Transitions。
  桌面会话行高不超过 52px；1440px/390px 布局、页面宽度、焦点与 CSP 检查通过。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39907127534) 通过：
  构建、浏览器、Python、隔离 OpenSSH、ShellCheck。本次没有 Windows 代码变更，未触发 Windows CI。
- 安装文件和公网 JS/CSS 内容摘要逐项匹配固定构建；页面 401、静态资源 200、no-store。
- 公网 bootstrap 200，匿名身份为空、登录期限 604800 秒、组织 transinfosh；下载接口 200；
  旧 `/support` 与 `/support/` 仍为 404。
- 短期非管理员网页探针验证真实列表/详情 200，用户管理接口 403；探针立即删除。
  OAuth 回调 URI 和状态 Cookie 路径一致，探针生成的 state 已清除。
- 控制台、GC timer 均 active；部署后控制台 error 级日志无记录。

## 回退与边界

备份目录：`/var/backups/tsuite-connect/20261023T054258Z-pre-v0.3.1-console/`，权限 0700。
保留旧运行目录、配置、unit 和元数据，不复制 SSH 私钥或短期会话私钥。必要时执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261023T054258Z-pre-v0.3.1-console/rollback.py
```

恢复旧运行目录及 current 指针，只重启控制台，不覆盖用户、数据库或客户会话。自动健康检查
通过，未触发回退。Firefox、Safari、物理手机、真实 GitHub 授权和客户关闭未实机验收；
隔离验证详见[测试映射](../console/控制台-测试映射.md)。
