# T Connect v0.3.5 品牌、导航和页脚上线验证

2026-10-23 15:58（Asia/Shanghai）部署至 `adam@192.168.2.52`，入口为
[T Connect](https://edge.trinfo.net/connect/)。

## 改动

界面品牌统一为 T Connect，包括登录页、顶栏、浏览器标题和版权页脚，移除分开的 Connect/TSuite
展示。仓库、服务、数据库、URL 和 SSH 标识保持原名，没有基础设施迁移。

顶栏当前导航项的样式原来匹配 data-active=true，而 Radix 实际输出空值属性，导致样式未生效；
现匹配属性存在状态。当前项有默认主题的选中背景及 aria-current，失去焦点和悬停后仍保留。
会话筛选继续采用原有 Tabs 选中态。表格查看/关闭操作改为官方 outline 按钮，移除重复统计摘要。

页脚包含动态年份版权，显示“© 2026 T Connect. 保留所有权利。”；根页面采用标准 flex 布局，
短页面页脚贴近视口底部，长页面跟随内容且不遮挡操作。登录页使用相同页脚。继续沿用默认 Neutral
主题和 Tailwind 布局，没有新增手写样式表规则。没有修改后端、接口、认证、数据库或 SSH 协议。

## 固定版本与产物

- tag：`v0.3.5`，源码提交：`c9b6ccdd637bcbf16c80241fe3b47b1924e80402`。
- [Release](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.5) 提供源码、网页包及 SHA256SUMS。
- 源码 SHA-256：`e0038522db0d33981c13504ada1da3aaf53dc1c0364f45d7685de971613543e6`。
- 网页包 SHA-256：`7931388deb11ac16d74b8c69c48d4414fc997c0f38175f876bc9e36577693f46`。
- 在固定 tag 的干净目录使用 lockfile 安装和构建，WEB_BUILD.json 固定提交与逐文件摘要。
- `/srv/tsuite-connect/current` 指向 `/srv/tsuite-connect/releases/v0.3.5`。

## 验证结果

- 本地 14 个 Chromium 流程通过，新增导航回归在修复前两项背景均透明而失败，修复后通过；
  对比实际背景和 aria-current，避免仅检查 CSS 类名。几何检查验证短页面页脚位于视口底部，
  390px 窄屏短视口下长页面页脚位于主内容后方；桌面/手机截图确认按钮和品牌，无横向溢出。
- 本地 123 项 Python、TypeScript、干净生产构建、Python 编译与 ShellCheck 通过。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39920443885) 全部通过：
  构建、14 个浏览器流程、123 项 Python、隔离 OpenSSH、语法与 ShellCheck。
  CI 浏览器步骤耗时较长，更新先基于完整本地检查执行，随后 CI 成功结束。
- 安装与公网 JS/CSS 摘要逐项匹配构建；匿名入口 401，HTML 标题为 T Connect，资源 200、no-store。
  bootstrap 200，默认登录期限 604800 秒、组织 transinfosh；两个客户端入口 200，旧页面入口 404。
- 60 秒非管理员临时网页身份只读验证列表/详情 200、用户管理 403，随后删除探针。
  OAuth 回调和状态 Cookie 路径一致，探针产生的 state 已清除，没有进行真实 GitHub 授权。
- 仅更新网页运行目录并重启控制台；配置、unit/drop-in、固定身份的摘要、权限及 4 个本地用户
  完整行指纹一致，broker 会话列表与更新前一致，更新后两条活动会话仍可查询。
  未创建、关闭或修改客户会话，Edge 的 v0.3.4 接入冲突提示保持不变。
- 控制台与 GC timer active，部署后控制台 error 级日志无记录。

## 回退与边界

备份：`/var/backups/tsuite-connect/20261023T075807Z-pre-v0.3.5-console/`，权限 0700，
不包含 SSH 私钥或短期授权。必要时执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261023T075807Z-pre-v0.3.5-console/rollback.py
```

只恢复旧网页运行目录和 current 指针，重启控制台，不覆盖数据库、用户和客户连接。
自动健康检查通过，未触发回退。Firefox、Safari、物理手机、真实 GitHub 授权及客户关闭未实机验收。
