# Windows 账户复用测试映射

| 场景 | 验证位置/方法 | 当前状态 |
|---|---|---|
| IDENTITY-03、04、10 | `test_windows_identity.py`：enrollment、CLI、broker、portable；原隔离 SSH 集成 | 131 项 Python、Linux CI 通过 |
| IDENTITY-01、02、06、07、08、09 | `test_windows_identity.ps1`、`test_windows_client.ps1`、`test_windows_cleanup.ps1`：账户替身、实际生命周期函数及失败回滚组合 | Linux pwsh、Windows PowerShell 5.1 CI 通过 |
| IDENTITY-04、10 | `test_windows_operator.ps1`：原生 SSH 参数解析、UPN 与旧元数据 | Windows CI 通过 |
| IDENTITY-04 | `test_windows_identity.ps1`：原生 stdin 字节夹具，中文账户登记，带 BOM 宿主输入编码及恢复 | Windows CI 通过；避免 Framework 自动 BOM 与 PowerShell ASCII 转码 |
| IDENTITY-01、05、06、07 | `test_windows_existing_auth.ps1`：隔离 SYSTEM sshd/Job，现有管理员公钥/证书认证与续期；关闭 A 保留 B、无关进程，强制停止 B；最终账户属性与用户目录保留 | OpenSSH 8.1、9.8.3 两套真实 Windows CI 通过 |
| IDENTITY-07、08 | 完整 bootstrap 失败、真实到期/重启清理和不同受支持 Windows 系统的安装流程 | 原单元生命周期覆盖；本功能未执行完整系统矩阵验收，不标为全部通过 |
| IDENTITY-01、05、06 | 真实客户本地管理员的受控端完整接入与关闭验收 | 未执行；不创建或转换无关生产会话 |
| AD 身份及 Entra 拒绝 | 域身份、UPN 与 SID 绑定/拒绝替身；真实 AD 环境 | 替身已通过；真实 AD 未验证 |

2026-11-06，代码提交 `932ed06de33c434b491540f69731e40e344e1b18`：
[Windows CI](https://github.com/transinfosh/tsuite-connect/actions/runs/42181564192)、
[Linux CI](https://github.com/transinfosh/tsuite-connect/actions/runs/42181564259)。
本记录后的提交仅更新文档时，以相同程序摘要及对应最终 CI 作为发布依据。
