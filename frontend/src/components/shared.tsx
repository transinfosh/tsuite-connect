import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, Copy, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { statusLabels, type Failure } from '@/lib/types'
import type { ComponentProps, ReactNode } from 'react'

export function Status({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('status-badge', `status-${status}`)}>
      <span className="status-dot" />
      {statusLabels[status] || status}
    </Badge>
  )
}
export function ErrorNotice({ error, dismiss }: { error: Failure | null; dismiss?: () => void }) {
  if (!error) return null
  return (
    <Alert variant="destructive" className="error-notice">
      <AlertCircle />
      <AlertTitle>操作未完成</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {error.request_id && <p className="diagnostic">诊断编号：{error.request_id}</p>}
      </AlertDescription>
      {dismiss && (
        <Button
          className="dismiss"
          size="icon-sm"
          variant="ghost"
          aria-label="关闭错误提示"
          onClick={dismiss}
        >
          <X />
        </Button>
      )}
    </Alert>
  )
}
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState('复制')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied('已复制')
    } catch {
      setCopied('请手动选择复制')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied('复制'), 2000)
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied === '已复制' ? <Check /> : <Copy />}
      <span aria-live="polite">{copied}</span>
    </Button>
  )
}
export function Field({
  label,
  id,
  hint,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Input {...props} id={id} />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
export function Busy({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <>
      {active && <LoaderCircle className="animate-spin" />}
      {children}
    </>
  )
}
export function Back({ onClick }: { onClick: () => void }) {
  return (
    <Button data-back-button variant="ghost" size="sm" className="back-button" onClick={onClick}>
      <ArrowLeft />
      返回会话列表
    </Button>
  )
}

// Controlled dialogs have no Radix trigger; remember the opener before focus enters.
export function ManagedDialogContent({
  busy = false,
  ...props
}: ComponentProps<typeof DialogContent> & { busy?: boolean }) {
  const opener = useRef<HTMLElement | null>(null)
  return (
    <DialogContent
      {...props}
      showCloseButton={!busy}
      onOpenAutoFocus={() => {
        opener.current = document.activeElement as HTMLElement | null
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        const target = opener.current?.isConnected
          ? opener.current
          : document.querySelector<HTMLElement>('[data-back-button]')
        target?.focus()
      }}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault()
      }}
      onInteractOutside={(event) => {
        if (busy) event.preventDefault()
      }}
    />
  )
}
