import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ManagedDialogContent, Busy, CopyButton, ErrorNotice, Field } from './shared'
import type { ConsoleModel } from '@/lib/use-console'
import type { Account } from '@/lib/types'

export function Users({ model: m }: { model: ConsoleModel }) {
  const [form, setForm] = useState({ username: '', display_name: '', role: 'operator' })
  const [action, setAction] = useState<{ user: Account; name: string } | null>(null)
  return (
    <>
      <header className="page-header">
        <div>
          <h1>用户管理</h1>
          <p>邀请同事，管理工作台的访问权限。</p>
        </div>
      </header>
      <section className="content-panel invite-panel">
        <h2>邀请新用户</h2>
        <p className="section-description">生成一次性链接，供同事设置密码并绑定验证器。</p>
        <form
          className="invite-form"
          onSubmit={(event) => {
            event.preventDefault()
            void m.inviteUser(form)
          }}
        >
          <Field
            id="invite-username"
            label="用户名"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            pattern="[A-Za-z0-9_-]{3,64}"
            minLength={3}
            maxLength={64}
            autoComplete="off"
            required
          />
          <Field
            id="invite-name"
            label="显示名称"
            value={form.display_name}
            onChange={(event) => setForm({ ...form, display_name: event.target.value })}
            maxLength={80}
            required
          />
          <div className="field">
            <Label htmlFor="invite-role">角色</Label>
            <NativeSelect
              id="invite-role"
              className="native-select"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
            >
              <NativeSelectOption value="operator">操作员</NativeSelectOption>
              <NativeSelectOption value="admin">管理员</NativeSelectOption>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={m.busy}>
            <Busy active={m.busy}>
              <Plus />
              生成邀请链接
            </Busy>
          </Button>
        </form>
      </section>
      {m.inviteUrl && (
        <section className="content-panel">
          <div className="command-heading">
            <h2>一次性绑定链接</h2>
            <CopyButton value={m.inviteUrl} />
          </div>
          <p className="section-description">
            30 分钟内有效，请通过安全渠道交付。完成 TOTP 重绑后，原登录会被撤销。
          </p>
          <pre className="command-code">{m.inviteUrl}</pre>
        </section>
      )}
      <section className="content-panel users-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {m.users.map((account) => (
              <TableRow key={account.username}>
                <TableCell>
                  <strong className="user-name">{account.display_name}</strong>
                  <span className="user-login">{account.username}</span>
                </TableCell>
                <TableCell>{account.is_admin ? '管理员' : '操作员'}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={account.enabled ? 'status-badge status-enrolled' : 'status-badge'}
                  >
                    {account.enabled ? '已启用' : '已禁用'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="user-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={m.busy}
                      onClick={() => {
                        m.setError(null)
                        setAction({ user: account, name: 'reset-totp' })
                      }}
                    >
                      重绑 TOTP
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={m.busy || account.username === m.user?.login}
                      onClick={() => {
                        m.setError(null)
                        setAction({ user: account, name: 'toggle' })
                      }}
                    >
                      {account.enabled ? '禁用' : '启用'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!m.busy && !open) setAction(null)
        }}
      >
        <ManagedDialogContent busy={m.busy}>
          <DialogHeader>
            <DialogTitle>
              {action?.name === 'reset-totp'
                ? '重绑动态验证码'
                : action?.user.enabled
                  ? '禁用用户'
                  : '启用用户'}
            </DialogTitle>
            <DialogDescription>
              {action?.name === 'reset-totp'
                ? `为 ${action.user.username} 生成重绑链接。完成绑定后，原登录会被撤销。`
                : `确认${action?.user.enabled ? '禁用' : '启用'} ${action?.user.username}？禁用会立即撤销其网页登录。`}
            </DialogDescription>
          </DialogHeader>
          <ErrorNotice error={m.error} />
          <DialogFooter>
            <Button variant="outline" disabled={m.busy} onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              disabled={m.busy}
              onClick={async () => {
                if (action && (await m.userAction(action.user, action.name))) setAction(null)
              }}
            >
              <Busy active={m.busy}>确认</Busy>
            </Button>
          </DialogFooter>
        </ManagedDialogContent>
      </Dialog>
    </>
  )
}
