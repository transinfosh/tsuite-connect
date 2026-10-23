import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ManagedDialogContent, Busy, ErrorNotice, Field } from './shared'
import type { ConsoleModel } from '@/lib/use-console'

export function SessionDialogs({ model: m }: { model: ConsoleModel }) {
  const [form, setForm] = useState({ customer: '', purpose: '' })
  return (
    <>
      <Dialog
        open={m.newOpen}
        onOpenChange={(open) => {
          if (!m.busy) m.setNewOpen(open)
        }}
      >
        <ManagedDialogContent busy={m.busy}>
          <DialogHeader>
            <DialogTitle>新建远程会话</DialogTitle>
            <DialogDescription>使用固定的环境标识，每次连接都会生成独立会话。</DialogDescription>
          </DialogHeader>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault()
              if (await m.createSession(form)) setForm({ customer: '', purpose: '' })
            }}
          >
            <Field
              id="customer"
              label="客户环境标识"
              placeholder="例如 customer-srm-prod-01"
              pattern="[a-z0-9][a-z0-9-]{0,47}"
              maxLength={48}
              autoComplete="off"
              value={form.customer}
              onChange={(event) => setForm({ ...form, customer: event.target.value })}
              required
            />
            <Field
              id="purpose"
              label="支持用途（可选）"
              placeholder="例如升级系统、排查问题"
              maxLength={200}
              value={form.purpose}
              onChange={(event) => setForm({ ...form, purpose: event.target.value })}
            />
            <ErrorNotice error={m.error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={m.busy}
                onClick={() => m.setNewOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={m.busy}>
                <Busy active={m.busy}>{m.busy ? '正在创建…' : '创建会话'}</Busy>
              </Button>
            </DialogFooter>
          </form>
        </ManagedDialogContent>
      </Dialog>
      <Dialog
        open={!!m.closeTarget}
        onOpenChange={(open) => {
          if (!m.busy && !open) m.setCloseTarget(null)
        }}
      >
        <ManagedDialogContent busy={m.busy}>
          <DialogHeader>
            <DialogTitle>关闭这个会话？</DialogTitle>
            <DialogDescription>
              系统会先确认客户侧清理，再撤销连接。正在操作的终端会断开，此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <code className="close-id">{m.closeTarget?.id}</code>
          <ErrorNotice error={m.error} />
          <DialogFooter>
            <Button variant="outline" disabled={m.busy} onClick={() => m.setCloseTarget(null)}>
              继续保留
            </Button>
            <Button variant="destructive" disabled={m.busy} onClick={() => m.closeSession()}>
              <Busy active={m.busy}>{m.busy ? '正在确认清理…' : '确认关闭'}</Busy>
            </Button>
          </DialogFooter>
        </ManagedDialogContent>
      </Dialog>
    </>
  )
}
