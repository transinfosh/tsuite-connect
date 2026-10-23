import { ChevronDown, Link2, LoaderCircle, LogOut, Monitor, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useConsole } from '@/lib/use-console'
import { Auth } from '@/components/auth'
import { Sessions } from '@/components/sessions'
import { CommandsView, Detail } from '@/components/details'
import { Users } from '@/components/users'
import { SessionDialogs } from '@/components/session-dialogs'
import { ErrorNotice } from '@/components/shared'

export default function App() {
  const m = useConsole()
  if (m.booting)
    return (
      <main className="initial-loading" role="status">
        <LoaderCircle className="animate-spin" />
        正在加载工作台…
      </main>
    )
  const auth = m.view === 'login' || m.view === 'invite'
  return (
    <TooltipProvider>
      <div className="application">
        {auth ? (
          <>
            <div className="auth-error">
              <ErrorNotice error={m.error} dismiss={() => m.setError(null)} />
            </div>
            <Auth model={m} />
          </>
        ) : (
          <>
            <header className="topbar">
              <div className="topbar-inner">
                <a
                  className="brand"
                  href="/connect/"
                  onClick={(event) => {
                    event.preventDefault()
                    m.navigate('/')
                  }}
                >
                  <span className="brand-symbol">
                    <Link2 />
                  </span>
                  Connect<span className="brand-company">TSuite</span>
                </a>
                <nav className="main-nav" aria-label="主导航">
                  <a
                    href="/connect/"
                    aria-current={m.view !== 'users' ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      m.navigate('/')
                    }}
                  >
                    <Monitor />
                    远程会话
                  </a>
                  {m.user?.is_admin && (
                    <a
                      href="/connect/users"
                      aria-current={m.view === 'users' ? 'page' : undefined}
                      onClick={(event) => {
                        event.preventDefault()
                        m.navigate('/users')
                      }}
                    >
                      <UsersRound />
                      用户管理
                    </a>
                  )}
                </nav>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="profile-button" aria-label="账户菜单">
                      <span className="profile-avatar">
                        {(m.user?.name || m.user?.login || '').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="profile-name">{m.user?.name || m.user?.login}</span>
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      {m.user?.login}
                      <span className="account-role">{m.user?.is_admin ? '管理员' : '操作员'}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={m.busy} onSelect={() => void m.logout()}>
                      <LogOut />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main className="workspace">
              <div className="workspace-body">
                {!m.newOpen && !m.closeTarget && (
                  <ErrorNotice error={m.error} dismiss={() => m.setError(null)} />
                )}
                {m.view === 'dashboard' ? (
                  <Sessions model={m} />
                ) : m.view === 'commands' ? (
                  <CommandsView model={m} />
                ) : m.view === 'users' ? (
                  <Users model={m} />
                ) : (
                  <Detail model={m} />
                )}
              </div>
              <footer className="workspace-footer">
                <span>TSuite Connect</span>
                <span>用完即关，临时授权自动清理。</span>
              </footer>
            </main>
            <SessionDialogs model={m} />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
