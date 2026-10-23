import { RefreshCw, ShieldCheck, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Back, CopyButton, Status } from './shared'
import { statusLabels, type Platform } from '@/lib/types'
import type { ConsoleModel } from '@/lib/use-console'

export function Detail({ model: m }: { model: ConsoleModel }) {
  return (
    <>
      <Back onClick={() => m.navigate('/')} />
      <header className="page-header">
        <div>
          <h1>会话详情</h1>
          <p>查看连接状态和会话记录。</p>
        </div>
        <Button variant="outline" disabled={m.busy} onClick={() => m.loadRoute()}>
          <RefreshCw />
          刷新状态
        </Button>
      </header>
      {!m.selected ? (
        <Skeleton className="detail-skeleton" />
      ) : (
        <section className="content-panel">
          <div className="detail-heading">
            <code>{m.selected.id}</code>
            <Status status={m.selected.status} />
          </div>
          <dl className="detail-list">
            {m.selected.fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>
                  {field.key === 'status'
                    ? statusLabels[field.value] || field.value
                    : String(field.value)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="detail-footer">
            <p>
              {m.selected.status === 'revoking'
                ? '正在关闭，请稍后刷新状态。'
                : ['closed', 'expired'].includes(m.selected.status)
                  ? '会话已结束，不再接受客户连接。'
                  : '关闭前会先确认客户侧清理，再撤销连接。'}
            </p>
            {['issued', 'enrolled'].includes(m.selected.status) && (
              <Button
                variant="outline"
                className="close-session"
                disabled={m.busy}
                onClick={() => {
                  m.setError(null)
                  m.setCloseTarget(m.selected)
                }}
              >
                关闭会话
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  )
}

export function CommandsView({ model: m }: { model: ConsoleModel }) {
  const commands = m.commands!
  const sections: {
    key: 'customer_command' | 'operator_command' | 'ai_instructions'
    title: string
    description: string
    field?: 'platform' | 'operator_platform'
  }[] = [
    {
      key: 'customer_command',
      title: '客户执行命令',
      description: '发送给客户执行。Windows 使用管理员 PowerShell，Linux 需 sudo。',
      field: 'platform',
    },
    {
      key: 'operator_command',
      title: '支持机执行命令',
      description: '在你的支持机执行。客户尚未接入时，程序会自动等待。',
      field: 'operator_platform',
    },
    {
      key: 'ai_instructions',
      title: '交给 AI 的操作说明',
      description: '复制后，在说明末尾补充需要完成的具体任务。',
    },
  ]
  return (
    <>
      <Back onClick={() => m.navigate('/')} />
      <header className="page-header">
        <div>
          <h1>会话已创建</h1>
          <p>
            <strong>{commands.customer}</strong>
            <span className="text-separator">/</span>
            <code>{commands.id}</code>
          </p>
        </div>
        <span className="ready-indicator">
          <ShieldCheck />
          准备连接
        </span>
      </header>
      <Alert className="credential-note">
        <ShieldCheck />
        <AlertDescription>
          以下内容包含一次性授权，只在当前页面显示。离开或刷新后无法重新获取，请在 15 分钟内领取。
        </AlertDescription>
      </Alert>
      {sections
        .filter((section) => commands[section.key])
        .map((section, index) => (
          <section className="command-panel" key={section.key}>
            <div className="command-heading">
              <span className="step-count">{index + 1}</span>
              <h2>{section.title}</h2>
              <div className="command-tools">
                {section.field && commands.grant && (
                  <div className="platform-toggle" aria-label={`${section.title}操作系统`}>
                    {(['linux', 'windows'] as Platform[]).map((platform) => (
                      <Button
                        key={platform}
                        variant={commands[section.field!] === platform ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-pressed={commands[section.field!] === platform}
                        disabled={
                          m.busy || (section.field === 'platform' && commands.customer_locked)
                        }
                        onClick={() => m.switchPlatform(section.field!, platform)}
                      >
                        {platform === 'linux' ? 'Linux' : 'Windows'}
                      </Button>
                    ))}
                  </div>
                )}
                <CopyButton value={commands[section.key]!} />
              </div>
            </div>
            <p className="command-description">{section.description}</p>
            <pre className="command-code">{commands[section.key]}</pre>
            {section.key === 'operator_command' && (
              <p className="command-footnote">
                <Terminal />
                Windows 支持机需 PowerShell 和 OpenSSH Client，无需管理员权限。
              </p>
            )}
          </section>
        ))}
    </>
  )
}
