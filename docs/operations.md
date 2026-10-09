# 运维与发布

## 范围与依赖

工具独立于业务部署仓库。系统依赖和安装顺序见 [控制服务安装](../control/README.md)；
客户端要求见 [README](../README.md)。FRP 为可选传输，Frappe/Bench/Ansible/Docker 均非运行依赖。

## 修改验证

在仓库根目录执行：

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile bastion/*.py console/*.py operator/tsuite-support operator/*.py customer/*.py
shellcheck --severity=warning control/*.sh bastion/*.sh customer/*.sh operator/*.sh tests/test_ssh_restrictions.sh
tests/test_ssh_restrictions.sh
python3 tests/verify_portable_ssh.py
```

最后一项需要免交互 sudo，启动两个隔离本机 sshd，使用临时密钥和随机回环端口，不修改系统 sshd。
Windows CI 在 Windows PowerShell 5.1 验证 ACL、生命周期、原生二进制转发及 OpenSSH 8.1/9.8.3 认证。
Linux 上的 PowerShell 验证不能替代 Windows ACL 验证。

## 线上维护

先只读确认目标主机、安装版本、服务状态和活动会话，再实施维护：

- 堡垒机：`sudo tsuite-support-session list`、`systemctl is-active caddy tsuite-support-gc.timer`。
- 控制服务：`sudo -n -u tsuite-support-operator tsuite-support-console-action list </dev/null`；
  检查 `tsuite-support-console.service`、`tsuite-support-operator-gc.timer`。
- HTTPS：未登录 `/support/` 返回 401；两个 operator-client 下载入口返回 200 且 no-store。

使用固定 tag/归档摘要。备份目标程序、服务配置、权限及固定身份后更新；优先在无活动会话时更新。
保留现有 `/etc/tsuite-support*` 配置、SSH Host Key、会话 CA、`/var/lib/tsuite-support*` 状态及已安装命令路径。
固定私钥备份需加密且限制权限；短期会话私钥不进入长期备份。不得为了验证创建、关闭或修改无关客户会话。
通过 stdin 执行 SSH 维护脚本时，脚本内 broker/SSH 自检命令应加 `</dev/null`，避免吞掉后续脚本。
更新后核验文件摘要、权限、systemd 服务、HTTPS 入口；失败时恢复备份程序和配置并重新核验。

## 版本发布

VERSION 为 `X.Y.Z`；验证通过后提交、创建同版本不可移动 tag `vX.Y.Z`。
使用 `git archive --format=tar.gz --prefix=tsuite-support-vX.Y.Z/ vX.Y.Z` 生成源码归档，
通过 `sha256sum` 生成校验文件，将两者发布到同名 GitHub Release。
业务部署使用已部署在 `192.168.2.52` 的支持服务，入口为 `https://edge.trinfo.net/support/`。
`tsuite_deploy` 不下载、不锁定版本、不安装支持工具；支持服务的发布和升级由本仓库独立维护。
已发布 tag/归档不覆盖；修复发布新版本。独立仓库不从下游加载运行时源码。

## 历史记录

[拆分记录](migration.md) 说明来源、保留的兼容接口及部署边界。`docs/validation/support-*.md`
是原仓库迁入的历史证据，文中的旧源码路径与 commit 指向当时的 `tsuite_deploy`，不代表当前目录。
