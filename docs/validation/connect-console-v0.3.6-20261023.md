# tSuite Connect v0.3.6 品牌文字上线验证

2026-10-23 17:03（Asia/Shanghai）通过现有部署机更新 [tSuite Connect](https://edge.trinfo.net/connect/)。

按确认名称统一为 `tSuite Connect`，同步顶栏、登录与邀请页面、浏览器标题、无脚本提示及版权页脚。
仅修改展示文字，沿用现有组件、布局和主题；服务标识、URL、认证、API、数据库及 SSH 协议兼容。

- 固定 tag：`v0.3.6`；提交：`a2489189ca5a2d0e5623446e374642b45f19ce85`。
- [发布产物](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.6)：源码、网页包及 SHA256SUMS。
- 源码 SHA-256：`6d27a0ccd999ad4a00fdc1ec7e9ef0eac17b12f4c65bd4eb8efd74b7d3be5c90`。
- 网页包 SHA-256：`88be1a85b360d2ac3c69ca9e32694d17fda49c756074d796551711dba7676a11`。
- 本地 TypeScript、生产构建及现有 Chromium 导航/版权/页脚几何回归通过；不可变 tag 干净构建通过。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39928537154) 全部成功，包含完整浏览器、Python 和隔离 SSH 检查。
- 公网标题为 `tSuite Connect · 远程连接工作台`，JS/CSS 与发布摘要匹配、200/no-store；匿名入口 401，bootstrap 正常。
- 60 秒合成非管理员 Web 身份只读核验会话列表/详情 200、用户管理 403，随后删除；OAuth 回调状态绑定通过。
- 配置、unit、固定身份文件及 4 个本地用户指纹不变，部署前后会话列表一致，更新后可只读查询 3 条活动会话。
- 控制台与 GC timer active，部署后 error 级日志无记录；未创建、关闭或修改客户会话，未更新 Edge。

`/srv/tsuite-connect/current` 指向 `/srv/tsuite-connect/releases/v0.3.6`。
回退备份为 `/var/backups/tsuite-connect/20261023T090308Z-pre-v0.3.6-console/`，权限 0700。
其中 `rollback.py` 恢复旧 Web 运行文件和 current 指针并重启控制台，不覆盖用户、配置或客户连接；本次未触发回退。

Firefox、Safari、物理手机及真实 GitHub 授权未新增实机验收。
