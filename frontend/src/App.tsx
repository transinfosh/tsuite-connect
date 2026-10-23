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
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu'
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
      <main
        className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" />
        正在加载工作台…
      </main>
    )
  const auth = m.view === 'login' || m.view === 'invite'
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        {auth ? (
          <>
            <div className="mx-auto max-w-lg px-4 pt-4 empty:hidden">
              <ErrorNotice error={m.error} dismiss={() => m.setError(null)} />
            </div>
            <Auth model={m} />
          </>
        ) : (
          <>
            <header className="border-b">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:flex-nowrap sm:px-6">
                <a
                  className="flex items-center gap-2 font-semibold"
                  href="/connect/"
                  onClick={(event) => {
                    event.preventDefault()
                    void m.navigate('/')
                  }}
                >
                  <Link2 className="size-5" />tSuite Connect
                </a>
                <NavigationMenu
                  viewport={false}
                  aria-label="主导航"
                  className="order-3 w-full max-w-none flex-none justify-start sm:order-none sm:w-auto sm:max-w-max"
                >
                  <NavigationMenuList className="justify-start">
                    {[
                      { to: '/', label: '远程会话', icon: Monitor },
                      ...(m.user?.is_admin
                        ? [{ to: '/users', label: '用户管理', icon: UsersRound }]
                        : []),
                    ].map((item) => (
                      <NavigationMenuItem key={item.to}>
                        <NavigationMenuLink
                          asChild
                          active={item.to === '/users' ? m.view === 'users' : m.view !== 'users'}
                        >
                          <a
                            className="flex-row items-center gap-2 whitespace-nowrap"
                            href={`/connect${item.to}`}
                            onClick={(event) => {
                              event.preventDefault()
                              void m.navigate(item.to)
                            }}
                          >
                            <item.icon />
                            {item.label}
                          </a>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    ))}
                  </NavigationMenuList>
                </NavigationMenu>
                <div className="ml-auto flex items-center gap-2">
                  {m.navigating && (
                    <span
                      role="status"
                      aria-label="正在加载页面数据"
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <LoaderCircle className="size-3 animate-spin" />
                      <span className="hidden sm:inline">正在加载…</span>
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label="账户菜单">
                        <span className="hidden sm:inline">{m.user?.name || m.user?.login}</span>
                        <span className="sm:hidden">账户</span>
                        <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>
                        {m.user?.login}
                        <p className="text-xs font-normal text-muted-foreground">
                          {m.user?.is_admin ? '管理员' : '操作员'}
                        </p>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={m.busy} onSelect={() => void m.logout()}>
                        <LogOut />
                        退出登录
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4 sm:px-6 sm:py-5">
              <div data-view-motion className="space-y-4" key={m.view}>
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
            </main>
            <SessionDialogs model={m} />
          </>
        )}
        <footer className="mt-auto border-t">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <span>© {new Date().getFullYear()} tSuite Connect. 保留所有权利。</span>
            <span>用完即关，临时授权自动清理。</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}
