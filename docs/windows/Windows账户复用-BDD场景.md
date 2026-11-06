# Windows 账户复用 BDD 场景

| 编号 | 场景与预期 |
|---|---|
| IDENTITY-01 | 正常管理员执行接入，使用其账户/SID；不创建账户、改密码、加组或设置账户期限。 |
| IDENTITY-02 | SYSTEM、服务、Entra 或 TSuite 临时身份执行接入，资源创建前拒绝。 |
| IDENTITY-03 | 同一 nonce、Host Key、登录名重试返回相同绑定；任一身份绑定变化均拒绝且不修改原状态。 |
| IDENTITY-04 | Windows 登录名包含合法空格、AD UPN 或 Unicode，以独立 SSH 参数传递；控制字符、通配或非法名字拒绝。 |
| IDENTITY-05 | 同一用户两个会话使用独立密钥/Job；关闭 A 后 B 和正常桌面进程继续运行。 |
| IDENTITY-06 | 续期只改变会话授权和期限，保留原账户属性；SID 不匹配不续期。 |
| IDENTITY-07 | 正常关闭、到期或 SYSTEM 任务异常停止，终止该会话 SSH 进程树并删除会话资源；不禁用、删除账户或删除用户配置。 |
| IDENTITY-08 | 自检或安装失败执行回滚，正常账户与其他会话不变。 |
| IDENTITY-09 | 旧会话无模式字段，继续旧账户所有权检查和清理退避；未知模式拒绝。 |
| IDENTITY-10 | Linux 和旧 Windows 元数据缺少新字段，既有支持端连接路径保持兼容。 |
