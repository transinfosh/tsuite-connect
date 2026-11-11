# 全局 SSH 闲置设置上线验证

2026-11-11 09:08（Asia/Shanghai）在现有控制机 `192.168.2.52` 与 `edge.trinfo.net`
完成管理员设置页面部署。管理员登录 [Connect](https://edge.trinfo.net/connect/settings) 后进入“系统设置”，
可调整全局默认闲置窗口，当前为 360 分钟（六小时），只作用于后续新建会话。

## 固定版本与验证

- 版本 [v0.4.2](https://github.com/transinfosh/tsuite-connect/releases/tag/v0.4.2)，源码提交
  `35354daf20d810287f7961933a70c69d22a70804`；源码、网页包与 SHA256SUMS 已发布。
- 源码归档 SHA-256：`7dad503864d5698386094aa128f9b976641ed166e8224329451b540c57bfc53b`。
- 网页包 SHA-256：`dd5985fa02cd8fb788388d92be64d5b6b7b89ab81221e9fea2e183122e39c50f`。
- [Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/42936148550) 通过：构建、15 个
  Chromium 流程、141 项 Python 测试、ShellCheck 及真实隔离 OpenSSH 验证。
- [Windows CI](https://github.com/transinfosh/tsuite-connect/actions/runs/42936148638) 通过。
  未变更 Windows 客户端；本次只部署新增设置能力所需的五个 Python 入口、前端产物、版本标记及精确动作授权。
- 首次 CI 因 `ubuntu-latest` 已变为 Ubuntu 26.04，而锁定的 Playwright 1.57 不支持该系统，在浏览器安装阶段失败。
  修复为 Ubuntu 24.04 后检查通过。v0.4.1 标签保留未覆盖；最终部署 v0.4.2。
- 合并此前已以 squash 方式进入主分支的开发历史时，仅 README 的两小时/六小时说明与版本号冲突；
  保留已验证的新值后，确认合并结果与 v0.4.1 源码树完全一致，再递增 CI 修复版本。

## 线上结果

控制台与 Edge manager/bridge 同步更新，两端只增加 `policy-show` 和 `policy-set` 的精确动作授权。
未重新运行安装器，未修改 SSH、Caddy、FRP 配置或客户侧资源；仅短暂重启控制台服务。

- 公网管理员设置页面返回 200，读取当前值 21600 秒；保存相同值成功，CSRF 缺失返回 403。
- 普通操作员读取及写入设置均返回 403；匿名设置 API 与页面入口返回 401。
- 使用 60 秒临时 Web 身份进行验证，结束后删除；本地用户指纹保持不变。没有新建、关闭客户支持会话。
- 公网 JS/CSS 与固定版本构建产物 SHA-256 一致，两个客户端下载入口均为 200/no-store。
- 部署前存在的 `8054e8668c74` 会话部署后仍为 enrolled、tunnel_reachable=true、闲置窗口 21600 秒。
  未改写其会话状态或客户密钥，未通过执行客户命令验证连通。
- 保护配置与固定身份文件指纹保持不变；六小时配置未重写。
- 控制台、两侧 GC timer、Caddy 均 active，控制台部署后 error 级日志无记录。

生产写入验证使用原值保存，未暂时改变全局默认值，避免影响同时新建的业务会话。
不同值保存、持久化、并发旧值冲突及失败保留原配置由隔离测试验证。真实账号登录/TOTP、物理手机、
Firefox 和 Safari 未新增人工验收。

## 制品、回退与备份

控制机 `/srv/tsuite-connect/current` 指向 `/srv/tsuite-connect/releases/v0.4.2`。
两端同目录保留固定归档、校验文件、源码、部署脚本；控制机 `deployment.json` 记录上线结果。
原 current 指针仍指向历史 v0.3.6，但实际运行文件已更新为 0.4.0；本次备份以实际运行文件为准，
不以旧 current 目录内容覆盖现场。

- 控制机备份：`/var/backups/tsuite-connect/20261111T010648Z-pre-v0.4.2-control/`。
- Edge 备份：`/var/backups/tsuite-connect/20261111T010643Z-pre-v0.4.2-edge/`。
- 两者目录为 0700，只备份被替换的程序、静态资源、精确授权及版本元数据，不复制临时或固定私钥。
- Edge 备份异机副本：控制机发布目录的 `edge-rollback-backup.tar.gz`，权限 0600，SHA-256
  `838eadeeb8202bc427e235fd6a46ddc4c2bc5a1565163d60d08f88671b7c8fbc`。

必要时先在控制机执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261111T010648Z-pre-v0.4.2-control/deploy.py rollback \
  /var/backups/tsuite-connect/20261111T010648Z-pre-v0.4.2-control
sudo ln -sfn /srv/tsuite-connect/releases/v0.3.6 /srv/tsuite-connect/current
```

随后在 Edge 执行：

```bash
sudo python3 /var/backups/tsuite-connect/20261111T010643Z-pre-v0.4.2-edge/deploy.py rollback \
  /var/backups/tsuite-connect/20261111T010643Z-pre-v0.4.2-edge
```

回退恢复实际旧程序与授权，不覆盖配置、用户数据库或会话状态。完成后重新验证页面、broker、
GC 和现有会话可达性；本次未执行回退。
