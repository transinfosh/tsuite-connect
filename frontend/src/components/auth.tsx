import { useState } from 'react'
import { ArrowRight, CodeXml, Link2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Busy, Field } from './shared'
import type { ConsoleModel } from '@/lib/use-console'

export function Auth({ model: m }: { model: ConsoleModel }) {
  const [credentials, setCredentials] = useState({ username: '', password: '', totp: '' })
  const [binding, setBinding] = useState({ password: '', confirm_password: '', totp: '' })
  const inviting = m.view === 'invite'
  const otp = m.authStep === 'totp'
  const update = (key: keyof typeof credentials) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setCredentials({ ...credentials, [key]: event.target.value })
  const updateBinding =
    (key: keyof typeof binding) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setBinding({ ...binding, [key]: event.target.value })
  return (
    <main className="auth-shell">
      <a href="/connect/" className="brand">
        <span className="brand-symbol">
          <Link2 />
        </span>
        Connect
      </a>
      <section className="auth-panel">
        {!inviting ? (
          <>
            <div className="auth-heading">
              <h1>{otp ? '验证你的身份' : '欢迎回来'}</h1>
              <p>
                {otp ? '输入验证器中的动态验证码，完成登录。' : '登录后，开始一次安全的远程支持。'}
              </p>
            </div>
            {m.config?.local_enabled && (
              <form
                className="form-stack"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (await m.login(credentials))
                    setCredentials({ ...credentials, password: '', totp: '' })
                }}
              >
                {otp ? (
                  <Field
                    id="totp"
                    label="动态验证码"
                    className="otp-input"
                    value={credentials.totp}
                    onChange={update('totp')}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    autoFocus
                  />
                ) : (
                  <>
                    <Field
                      id="username"
                      label="账号"
                      value={credentials.username}
                      onChange={update('username')}
                      autoComplete="username"
                      required
                      autoFocus
                    />
                    <Field
                      id="password"
                      label="密码"
                      value={credentials.password}
                      onChange={update('password')}
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </>
                )}
                <Button type="submit" size="lg" disabled={m.busy}>
                  <Busy active={m.busy}>{m.busy ? '正在验证…' : otp ? '确认登录' : '继续'}</Busy>
                  {!m.busy && <ArrowRight />}
                </Button>
                {otp && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={m.busy}
                    onClick={() => {
                      m.setAuthStep('password')
                      m.setError(null)
                    }}
                  >
                    返回账号登录
                  </Button>
                )}
              </form>
            )}
            {m.config?.local_enabled && (
              <div className="auth-divider">
                <Separator />
                <span>或</span>
                <Separator />
              </div>
            )}
            <Button variant="outline" size="lg" asChild className="github-login">
              <a href="/connect/login">
                <CodeXml />
                使用 GitHub 登录
              </a>
            </Button>
            <p className="auth-requirements">
              GitHub 账号须属于 <strong>{m.config?.allowed_org}</strong> 组织
              {m.config?.allowed_team && (
                <>
                  {' '}
                  / <strong>{m.config.allowed_team}</strong> 团队
                </>
              )}
              ，并授权读取成员资格。
            </p>
            <p className="auth-lifetime">
              本设备登录有效 {Math.round((m.config?.session_ttl_seconds || 0) / 8640) / 10}{' '}
              天，共用设备使用后请退出。
            </p>
          </>
        ) : m.invite ? (
          <>
            <div className="auth-heading">
              <h1>
                {m.invite.step === 'complete'
                  ? '账号已启用'
                  : m.invite.step === 'totp'
                    ? '绑定验证器'
                    : '设置你的账号'}
              </h1>
              <p>
                {m.invite.step === 'complete'
                  ? '密码与动态验证码已设置，现在可以登录。'
                  : `${m.invite.username}，完成设置即可使用 Connect。`}
              </p>
            </div>
            {m.invite.step === 'complete' ? (
              <Button className="w-full" onClick={() => m.navigate('/')}>
                前往登录
                <ArrowRight />
              </Button>
            ) : (
              <form
                className="form-stack"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (await m.submitInvite(binding))
                    setBinding({ password: '', confirm_password: '', totp: '' })
                }}
              >
                {m.invite.step === 'password' ? (
                  <>
                    <Field
                      id="new-password"
                      label="密码 · 至少 16 位"
                      value={binding.password}
                      onChange={updateBinding('password')}
                      type="password"
                      minLength={16}
                      autoComplete="new-password"
                      required
                    />
                    <Field
                      id="confirm-password"
                      label="再次输入密码"
                      value={binding.confirm_password}
                      onChange={updateBinding('confirm_password')}
                      type="password"
                      minLength={16}
                      autoComplete="new-password"
                      required
                    />
                  </>
                ) : (
                  <>
                    <img src={m.invite.qr} className="totp-qr" alt="验证器绑定二维码" />
                    <details className="totp-fallback">
                      <summary>无法扫码？手动绑定</summary>
                      <code className="secret">{m.invite.secret}</code>
                      <a href={m.invite.uri}>在本机验证器打开</a>
                    </details>
                    <Field
                      id="bind-totp"
                      label="动态验证码"
                      className="otp-input"
                      value={binding.totp}
                      onChange={updateBinding('totp')}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required
                    />
                  </>
                )}
                <Button type="submit" size="lg" disabled={m.busy}>
                  <Busy active={m.busy}>
                    {m.busy
                      ? '正在保存…'
                      : m.invite.step === 'totp'
                        ? '完成绑定'
                        : '继续绑定验证器'}
                  </Busy>
                </Button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1>邀请未能加载</h1>
            <p className="muted">请检查错误提示，或联系管理员重新发送邀请。</p>
            <Button variant="outline" onClick={() => m.loadRoute()}>
              重试
            </Button>
          </>
        )}
      </section>
      <p className="auth-footer">
        <ShieldCheck />
        临时授权，安心连接
      </p>
    </main>
  )
}
