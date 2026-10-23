import { RefreshCw, ShieldCheck, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Back, CopyButton, Status } from './shared'
import { statusLabels, type Platform } from '@/lib/types'
import type { ConsoleModel } from '@/lib/use-console'

export function Detail({ model: m }: { model: ConsoleModel }) {
  return (
    <>
      <Back onClick={() => void m.navigate('/')} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">会话详情</h1>
          <p className="text-sm text-muted-foreground">查看连接状态和会话记录。</p>
        </div>
        <Button variant="outline" size="sm" disabled={m.busy} onClick={() => m.loadRoute()}>
          <RefreshCw className={m.busy ? 'animate-spin' : ''} />
          刷新状态
        </Button>
      </header>
      {!m.selected ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
            <code className="text-sm">{m.selected.id}</code>
            <Status status={m.selected.status} />
          </CardHeader>
          <CardContent className="px-4">
            <dl className="divide-y">
              {m.selected.fields.map((field) => (
                <div
                  key={field.key}
                  className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]"
                >
                  <dt className="text-muted-foreground">{field.label}</dt>
                  <dd className="min-w-0 wrap-anywhere">
                    {field.key === 'status'
                      ? statusLabels[field.value] || field.value
                      : String(field.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-4 pt-3">
            <p className="text-sm text-muted-foreground">
              {m.selected.status === 'revoking'
                ? '正在关闭，请稍后刷新状态。'
                : ['closed', 'expired'].includes(m.selected.status)
                  ? '会话已结束，不再接受客户连接。'
                  : '关闭前会先确认客户侧清理，再撤销连接。'}
            </p>
            {['issued', 'enrolled'].includes(m.selected.status) && (
              <Button
                variant="outline"
                size="sm"
                disabled={m.busy}
                onClick={() => {
                  m.setError(null)
                  m.setCloseTarget(m.selected)
                }}
              >
                关闭会话
              </Button>
            )}
          </CardFooter>
        </Card>
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
      <Back onClick={() => void m.navigate('/')} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">会话已创建</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {commands.customer}
            <span>/</span>
            <code>{commands.id}</code>
          </p>
        </div>
        <Badge variant="outline">
          <ShieldCheck />
          准备连接
        </Badge>
      </header>
      <Alert>
        <ShieldCheck />
        <AlertDescription>
          以下内容包含一次性授权，只在当前页面显示。离开或刷新后无法重新获取，请在 15 分钟内领取。
        </AlertDescription>
      </Alert>
      {sections
        .filter((section) => commands[section.key])
        .map((section, index) => (
          <Card className="gap-3 py-4" key={section.key}>
            <CardHeader className="gap-2 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{index + 1}</Badge>
                <CardTitle>{section.title}</CardTitle>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {section.field && commands.grant && (
                    <div
                      className="flex items-center gap-1"
                      aria-label={`${section.title}操作系统`}
                    >
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
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <pre className="command-code whitespace-pre-wrap break-all rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">
                {commands[section.key]}
              </pre>
            </CardContent>
            {section.key === 'operator_command' && (
              <CardFooter className="gap-2 px-4 text-xs text-muted-foreground">
                <Terminal className="size-4 shrink-0" />
                Windows 支持机需 PowerShell 和 OpenSSH Client，无需管理员权限。
              </CardFooter>
            )}
          </Card>
        ))}
    </>
  )
}
