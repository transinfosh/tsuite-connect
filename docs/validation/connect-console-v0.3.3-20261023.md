# Connect v0.3.3 两端独立选择与两步骤上线验证

2026-10-23 14:07（Asia/Shanghai）部署至 `adam@192.168.2.52`，入口为
[Connect](https://edge.trinfo.net/connect/)。

## 改动与原因

原命令页两端系统选择共用全局 busy，导致切换一端时另一端也置灰。
隔离 Chromium 用例阻塞受控机系统请求，原实现的控制机 Windows 按钮仍 disabled，回归失败。

现为两端独立跟踪待处理状态，切换一端时另一端仍可选择。接口仍接受完整平台组合和
current_platform 校验；两端选择按最新确认响应依次提交，避免并行旧状态互相覆盖。
失败停止后续选择，明确提示尚未提交，不自动重放。相关命令更新时暂停该命令复制，AI 说明
依赖两端，任一端更新时暂停 AI 复制并显示进度。受控机已接入后的系统锁定保持不变。

页面分为“受控机”和“控制机”两步，分别解释为接受远程操作的机器与发起操作的本机。
AI 说明作为控制机卡片内的二级内容保留独立复制入口，不再作为第三步。
沿用 shadcn/ui 默认组件、Neutral 配色和既有紧凑布局，未增加样式表规则。

没有修改后端、API 签名、数据库、授权、一次性凭据保存方式、SSH 协议或 Windows 客户端。
内部 platform/operator_platform 字段不更名，旧兼容接入行为保留。

## 固定产物

- tag：`v0.3.3`，源码提交：`3385862ff679b099a362e178dfbb9a75c18d0364`。
- [GitHub Release](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.3.3) 含源码、网页构建包及摘要。
- 源码 SHA-256：`37b2cbeafa5db0006e4633033b3cdb01b3706653f9229969321bc28f10c45dec`。
- 网页包 SHA-256：`3d228c843b8926e4fd600fe7fd1bffd361cb8de7bf5bb9bc3fcaae3a390d088b`。
- 固定 tag 干净目录通过 npm ci、TypeScript 与生产构建，WEB_BUILD.json 记录来源及逐文件摘要。
- `/srv/tsuite-connect/current` 指向 `/srv/tsuite-connect/releases/v0.3.3`。

## 验证与保护

- 本地 13 个 Chromium 流程通过：双方向独立选择、请求最新平台组合、失败不重放、
  复制可用性、两步骤及 AI 所属关系、桌面/手机布局，以及原有登录、TOTP、关闭重试、
  用户邀请、即时导航、旧响应隔离、焦点、CSP 和减少动画回归。
- 使用合成授权的 1440px/390px 截图检查通过，无页面水平溢出；未使用生产截图内的临时凭据。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/39909363154) 通过构建、
  13 个浏览器流程、122 项 Python 测试、隔离 OpenSSH、语法与 ShellCheck。
  Windows 代码未改，未触发 Windows CI。
- 已安装文件与公网 JS/CSS 摘要逐项匹配构建清单；匿名首页 401，资源 200、no-store。
  bootstrap 200，组织 transinfosh、登录期限 604800 秒；两个客户端下载 200，旧页面入口 404。
- 临时非管理员网页探针只读验证真实列表/详情 200、用户管理 403；结束后删除探针会话。
  OAuth 跳转与状态 Cookie 路径一致，探针生成的 state 已清理，未进行真实 GitHub 授权。
- 仅切换网页运行目录并重启控制台；服务与 GC timer active，部署后 error 级日志无记录。
  配置、unit/drop-in、固定身份的摘要和权限一致，4 个本地用户完整行指纹一致；
  全部 broker 会话记录与更新前一致，未创建、关闭或修改客户 SSH 会话。

## 回退与边界

备份：`/var/backups/tsuite-connect/20261023T060717Z-pre-v0.3.3-console/`，权限 0700，
不包含 SSH 私钥或短期会话私钥。必要时执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261023T060717Z-pre-v0.3.3-console/rollback.py
```

仅恢复旧网页运行目录和 current 指针，重启控制台，不覆盖数据库、用户或客户会话。
自动健康检查通过，未触发回退。Firefox、Safari、物理手机、真实客户系统切换和关闭未实机验收，
场景覆盖以[测试映射](../console/控制台-测试映射.md)为准。
