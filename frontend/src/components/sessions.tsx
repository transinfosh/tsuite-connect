import { useMemo, useState } from 'react'
import { ArrowRight, Laptop, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Status } from './shared'
import { transition } from '@/lib/transition'
import type { ConsoleModel } from '@/lib/use-console'
import type { Session } from '@/lib/types'

function SessionId({ session, model: m }: { session: Session; model: ConsoleModel }) {
  return (
    <Button variant="link" size="sm" asChild className="h-auto p-0">
      <a
        href={`/connect/session/${session.id}`}
        onClick={(event) => {
          event.preventDefault()
          void m.navigate(`/session/${session.id}`)
        }}
      >
        <code>{session.id}</code>
        <ArrowRight />
      </a>
    </Button>
  )
}
function Actions({ session, model: m }: { session: Session; model: ConsoleModel }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => void m.navigate(`/session/${session.id}`)}>
        查看详情
      </Button>
      {['issued', 'enrolled'].includes(session.status) && (
        <Button
          variant="outline"
          size="sm"
          disabled={m.busy}
          onClick={() => {
            m.setError(null)
            m.setCloseTarget(session)
          }}
        >
          关闭会话
        </Button>
      )}
    </div>
  )
}
export function Sessions({ model: m }: { model: ConsoleModel }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const groups = useMemo(() => {
    const result = new Map<string, Session[]>()
    for (const session of m.sessions) {
      if (filter !== 'all' && session.status !== filter) continue
      if (!`${session.customer} ${session.id}`.toLowerCase().includes(search.toLowerCase()))
        continue
      const customer = session.customer || '未命名环境'
      if (!result.has(customer)) result.set(customer, [])
      result.get(customer)!.push(session)
    }
    return [...result].sort(([a], [b]) => a.localeCompare(b))
  }, [m.sessions, search, filter])
  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">远程会话</h1>
          <p className="text-sm text-muted-foreground">连接客户环境，完成远程支持。</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            m.setError(null)
            m.setNewOpen(true)
          }}
        >
          <Plus />
          新建会话
        </Button>
      </header>
      <Card className="gap-0 overflow-hidden py-0" aria-label="会话列表">
        <CardHeader className="gap-2 border-b px-3 py-2 [.border-b]:pb-2 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={filter} onValueChange={(value) => transition(() => setFilter(value))}>
            <TabsList aria-label="筛选会话">
              <TabsTrigger value="all">
                全部会话 <span className="text-xs">{m.sessions.length}</span>
              </TabsTrigger>
              <TabsTrigger value="enrolled">已连接</TabsTrigger>
              <TabsTrigger value="issued">等待客户</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索客户或会话 ID"
                aria-label="搜索客户或会话 ID"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="刷新会话"
              disabled={m.loading}
              onClick={() => m.refresh()}
            >
              <RefreshCw className={m.loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {m.loading && !m.sessionsLoaded ? (
            <div className="space-y-2 p-3" role="status" aria-label="正在加载会话">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : !m.sessionsLoaded ? (
            <div className="p-3">
              <Button variant="outline" onClick={() => m.refresh()}>
                重新加载会话
              </Button>
            </div>
          ) : groups.length ? (
            <>
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">会话 ID</TableHead>
                      <TableHead>连接状态</TableHead>
                      <TableHead>回环端口</TableHead>
                      <TableHead className="pr-4 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.flatMap(([customer, sessions]) => [
                      <TableRow key={customer} className="bg-muted/50">
                        <TableCell colSpan={4} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Laptop className="size-4 text-muted-foreground" />
                            <h2 className="text-sm font-medium">{customer}</h2>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {sessions.length} 个会话
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>,
                      ...sessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell className="pl-4">
                            <SessionId session={session} model={m} />
                          </TableCell>
                          <TableCell>
                            <Status status={session.status} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {session.remote_port}
                          </TableCell>
                          <TableCell className="pr-2">
                            <Actions session={session} model={m} />
                          </TableCell>
                        </TableRow>
                      )),
                    ])}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y sm:hidden">
                {groups.map(([customer, sessions]) => (
                  <section key={customer}>
                    <div className="flex items-center gap-2 bg-muted/50 px-3 py-2">
                      <Laptop className="size-4 shrink-0 text-muted-foreground" />
                      <h2 className="min-w-0 text-sm font-medium wrap-anywhere">{customer}</h2>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {sessions.length} 个会话
                      </span>
                    </div>
                    <div className="divide-y">
                      {sessions.map((session) => (
                        <div key={session.id} className="space-y-2 px-3 py-2">
                          <SessionId session={session} model={m} />
                          <div className="flex items-center justify-between">
                            <Status status={session.status} />
                            <span className="text-xs text-muted-foreground">
                              回环端口 {session.remote_port}
                            </span>
                          </div>
                          <Actions session={session} model={m} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-10">
              <Laptop className="mb-1 size-6 text-muted-foreground" />
              <h2 className="font-medium">
                {search || filter !== 'all' ? '没有匹配的会话' : '从一次连接开始'}
              </h2>
              <p className="text-center text-sm text-muted-foreground">
                {search || filter !== 'all'
                  ? '试试其他搜索内容或连接状态。'
                  : '创建一个会话，把接入命令发送给客户。'}
              </p>
              {!search && filter === 'all' && (
                <Button variant="outline" size="sm" onClick={() => m.setNewOpen(true)}>
                  <Plus />
                  创建第一个会话
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {m.lastUpdated && (
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>每 15 秒自动更新</span>
          <span>最近更新 {m.lastUpdated}</span>
        </div>
      )}
    </>
  )
}
