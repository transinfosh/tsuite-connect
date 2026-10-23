import { useState } from 'react'
import { ArrowRight, CodeXml, Link2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
      <a href="/connect/" className="flex items-center gap-2 text-lg font-semibold">
        <span className="inline-flex items-center">
          <Link2 />
        </span>
        tSuite Connect
      </a>
      <Card className="w-full max-w-sm gap-4 py-4">
        <CardContent data-view-motion className="space-y-4 px-4">
          {!inviting ? (
            <>
              <div className="space-y-1 [&>p]:text-sm [&>p]:text-muted-foreground">
                <h1 className="text-xl font-semibold">{otp ? '验证你的身份' : '欢迎回来'}</h1>
                <p>
                  {otp
                    ? '输入验证器中的动态验证码，完成登录。'
                    : '登录后，开始一次安全的远程支持。'}
                </p>
              </div>
              {m.config?.local_enabled && (
                <form
                  className="grid gap-3"
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
                      className="text-center font-mono tracking-widest"
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
                  <Button type="submit" size="default" disabled={m.busy}>
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
                <div className="flex items-center gap-3 text-xs text-muted-foreground [&>div]:flex-1">
                  <Separator />
                  <span>或</span>
                  <Separator />
                </div>
              )}
              <Button variant="outline" size="default" asChild className="w-full">
                <a href="/connect/login">
                  <CodeXml />
                  使用 GitHub 登录
                </a>
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                GitHub 账号须属于 <strong>{m.config?.allowed_org}</strong> 组织
                {m.config?.allowed_team && (
                  <>
                    {' '}
                    / <strong>{m.config.allowed_team}</strong> 团队
                  </>
                )}
                ，并授权读取成员资格。
              </p>
              <p className="text-xs text-muted-foreground">
                本设备登录有效 {Math.round((m.config?.session_ttl_seconds || 0) / 8640) / 10}{' '}
                天，共用设备使用后请退出。
              </p>
            </>
          ) : m.invite ? (
            <>
              <div className="space-y-1 [&>p]:text-sm [&>p]:text-muted-foreground">
                <h1 className="text-xl font-semibold">
                  {m.invite.step === 'complete'
                    ? '账号已启用'
                    : m.invite.step === 'totp'
                      ? '绑定验证器'
                      : '设置你的账号'}
                </h1>
                <p>
                  {m.invite.step === 'complete'
                    ? '密码与动态验证码已设置，现在可以登录。'
                    : `${m.invite.username}，完成设置即可使用 tSuite Connect。`}
                </p>
              </div>
              {m.invite.step === 'complete' ? (
                <Button className="w-full" onClick={() => m.navigate('/')}>
                  前往登录
                  <ArrowRight />
                </Button>
              ) : (
                <form
                  className="grid gap-3"
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
                      <img src={m.invite.qr} className="mx-auto size-48" alt="验证器绑定二维码" />
                      <details className="space-y-2 text-sm text-muted-foreground">
                        <summary>无法扫码？手动绑定</summary>
                        <code className="secret block break-all rounded-md border bg-muted p-2 font-mono text-xs">
                          {m.invite.secret}
                        </code>
                        <a href={m.invite.uri}>在本机验证器打开</a>
                      </details>
                      <Field
                        id="bind-totp"
                        label="动态验证码"
                        className="text-center font-mono tracking-widest"
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
                  <Button type="submit" size="default" disabled={m.busy}>
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
              <h1 className="text-xl font-semibold">邀请未能加载</h1>
              <p className="text-sm text-muted-foreground">
                请检查错误提示，或联系管理员重新发送邀请。
              </p>
              <Button variant="outline" onClick={() => m.loadRoute()}>
                重试
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <p className="flex items-center gap-2 text-xs text-muted-foreground [&>svg]:size-4">
        <ShieldCheck />
        临时授权，安心连接
      </p>
    </main>
  )
}
