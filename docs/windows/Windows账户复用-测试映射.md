# Windows 账户复用测试映射

| 场景 | 验证位置/方法 | 当前状态 |
|---|---|---|
| IDENTITY-03、04、10 | Python enrollment、CLI、broker、portable 回归；原隔离 SSH 集成 | 本地已通过；完整 CI 待执行 |
| IDENTITY-01、02、06、07、08、09 | 隔离 PowerShell 账户生命周期替身，真实清理/续期路径 | 本地已通过；完整 CI 待执行 |
| IDENTITY-04、10 | Windows 原生支持端 SSH 参数和登录名回归 | 本地已通过；完整 CI 待执行 |
| IDENTITY-05、07 | Windows CI 两个隔离 SYSTEM sshd/Job，现有账户认证、无关进程存活、强制停止 | 已实现；Windows CI 待执行 |
| IDENTITY-01、05、06 | 真实客户本地管理员的受控端命令与关闭验收 | 未执行；不能影响正在使用的会话 |
| AD 身份及 Entra 拒绝 | 域替身与真实 AD 环境 | 替身已通过；真实 AD 未验证 |
