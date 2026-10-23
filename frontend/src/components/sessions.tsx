import { useMemo, useState } from 'react'
import { ArrowRight, CircleHelp, Laptop, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Status } from './shared'
import type { ConsoleModel } from '@/lib/use-console'
import type { Session } from '@/lib/types'

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
  const connected = m.sessions.filter((session) => session.status === 'enrolled').length
  const totalCustomers = new Set(m.sessions.map((session) => session.customer)).size
  return (
    <>
      <header className="page-header">
        <div>
          <h1>远程会话</h1>
          <p>连接客户环境，轻松完成远程支持。</p>
        </div>
        <Button
          onClick={() => {
            m.setError(null)
            m.setNewOpen(true)
          }}
        >
          <Plus />
          新建会话
        </Button>
      </header>
      <div className="overview">
        <span>
          <strong>{totalCustomers}</strong> 个客户环境
        </span>
        <span className="overview-divider" />
        <span>
          <i className="online-dot" />
          <strong>{connected}</strong> 个已连接
        </span>
        <span>
          <strong>{m.sessions.length - connected}</strong> 个等待或处理中
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="会话期限说明">
              <CircleHelp />
            </Button>
          </TooltipTrigger>
          <TooltipContent>结束后会话从列表移除，记录保留供审计。</TooltipContent>
        </Tooltip>
      </div>
      <section className="session-panel" aria-label="会话列表">
        <div className="list-toolbar">
          <div className="status-filters" aria-label="筛选会话">
            <Button
              variant={filter === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              全部会话<span className="filter-count">{m.sessions.length}</span>
            </Button>
            <Button
              variant={filter === 'enrolled' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={filter === 'enrolled'}
              onClick={() => setFilter('enrolled')}
            >
              已连接
            </Button>
            <Button
              variant={filter === 'issued' ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={filter === 'issued'}
              onClick={() => setFilter('issued')}
            >
              等待客户
            </Button>
          </div>
          <div className="search-tools">
            <div className="search-field">
              <Search />
              <Input
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
        </div>
        {m.loading && !m.sessions.length ? (
          <div className="loading-list" role="status" aria-label="正在加载会话">
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        ) : groups.length ? (
          <div className="customer-groups">
            {groups.map(([customer, sessions]) => (
              <section className="customer-group" key={customer}>
                <div className="group-heading">
                  <Laptop />
                  <h2>{customer}</h2>
                  <span>{sessions.length} 个会话</span>
                </div>
                <div className="column-heading" aria-hidden="true">
                  <span>会话 ID</span>
                  <span>连接状态</span>
                  <span>回环端口</span>
                  <span>操作</span>
                </div>
                {sessions.map((session) => (
                  <div className="session-row" key={session.id}>
                    <a
                      className="session-id"
                      href={`/connect/session/${session.id}`}
                      onClick={(event) => {
                        event.preventDefault()
                        m.navigate(`/session/${session.id}`)
                      }}
                    >
                      {session.id}
                      <ArrowRight />
                    </a>
                    <div className="session-status">
                      <Status status={session.status} />
                    </div>
                    <div className="session-port">
                      <span>回环端口 </span>
                      {session.remote_port}
                    </div>
                    <div className="session-actions">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => m.navigate(`/session/${session.id}`)}
                      >
                        查看详情
                      </Button>
                      {['issued', 'enrolled'].includes(session.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="close-session"
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
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-symbol">
              <Laptop />
            </span>
            <h2>{search || filter !== 'all' ? '没有匹配的会话' : '从一次连接开始'}</h2>
            <p>
              {search || filter !== 'all'
                ? '试试其他搜索内容或连接状态。'
                : '创建一个会话，把接入命令发送给客户。'}
            </p>
            {!search && filter === 'all' && (
              <Button variant="outline" onClick={() => m.setNewOpen(true)}>
                <Plus />
                创建第一个会话
              </Button>
            )}
          </div>
        )}
      </section>
      {m.lastUpdated && (
        <div className="list-footer">
          <span>
            <span className="online-dot" />
            自动更新已开启
          </span>
          <span>最近更新 {m.lastUpdated}</span>
        </div>
      )}
    </>
  )
}
