import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Busy } from './shared'
import type { ConsoleModel } from '@/lib/use-console'

export function SystemSettings({ model: m }: { model: ConsoleModel }) {
  const [minutes, setMinutes] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (m.policy) setMinutes(String(m.policy.idle_timeout_seconds / 60))
  }, [m.policy])
  const seconds = Number(minutes) * 60
  return (
    <>
      <h1 className="text-xl font-semibold">系统设置</h1>
      {!m.user?.is_admin ? (
        <p>只有管理员可以管理系统设置。</p>
      ) : (
        <Card className="max-w-xl gap-4 p-5">
          <h2 className="font-medium">远程会话</h2>
          <p className="text-sm text-muted-foreground">
            保存后仅新建会话使用此默认值，已有会话保持原期限。实际输入自动续期，任务输出和保活不续期。
          </p>
          {m.policy ? (
            <form className="space-y-4" onSubmit={async (event) => {
              event.preventDefault()
              setSaved(false)
              if (await m.savePolicy(seconds)) setSaved(true)
            }}>
              <div className="space-y-2">
                <Label htmlFor="idle-minutes">默认闲置超时（分钟）</Label>
                <Input id="idle-minutes" type="number" min={m.policy.minimum_seconds / 60}
                  max={m.policy.maximum_seconds / 60} step="any" required value={minutes}
                  disabled={m.busy || !!m.navigating}
                  onChange={(event) => { setMinutes(event.target.value); setSaved(false) }} />
                <p className="text-sm text-muted-foreground">允许 5–480 分钟；360 分钟为 6 小时。</p>
              </div>
              <Button type="submit" disabled={m.busy || !!m.navigating || !Number.isInteger(seconds)
                || seconds < m.policy.minimum_seconds || seconds > m.policy.maximum_seconds
                || seconds === m.policy.idle_timeout_seconds}>
                <Busy active={m.busy}>保存设置</Busy>
              </Button>
              {saved && <p role="status" className="text-sm">已保存，新建会话将使用此设置。</p>}
            </form>
          ) : <p role="status">{m.navigating ? '正在加载设置…' : '设置尚未加载，请重试。'}</p>}
          <Button variant="outline" disabled={m.busy || !!m.navigating}
            onClick={() => { setSaved(false); void m.refresh() }}>重新加载设置</Button>
        </Card>
      )}
    </>
  )
}
