import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Account, Commands, Config, Detail, Failure, Invite, Platform, Session } from './types'

const currentPath = () => location.pathname.replace(/^\/connect/, '') || '/'

export function useConsole() {
  const [config, setConfig] = useState<Config | null>(null)
  const configRef = useRef(config)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const refreshing = useRef(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [users, setUsers] = useState<Account[]>([])
  const [path, setPath] = useState(currentPath)
  const [selected, setSelected] = useState<Detail | null>(null)
  const [commands, setCommands] = useState<Commands | null>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteUrl, setInviteUrl] = useState('')
  const [token, setToken] = useState(() => new URLSearchParams(location.search).get('token') || '')
  const [authStep, setAuthStep] = useState('password')
  const [newOpen, setNewOpen] = useState(false)
  const [closeTarget, setCloseTarget] = useState<Session | null>(null)
  const [lastUpdated, setLastUpdated] = useState('')
  const updateConfig = useCallback((value: Config | null) => {
    configRef.current = value
    setConfig(value)
  }, [])
  const view =
    path === '/invite'
      ? 'invite'
      : !config?.user
        ? 'login'
        : commands
          ? 'commands'
          : path === '/users'
            ? 'users'
            : path.startsWith('/session/')
              ? 'detail'
              : 'dashboard'

  const request = useCallback(
    async <T>(endpoint: string, data?: Record<string, unknown>) => {
      try {
        return await api<T>(endpoint, data, configRef.current?.user?.csrf)
      } catch (failure) {
        if ((failure as Failure).code === 'login_required') {
          updateConfig(configRef.current ? { ...configRef.current, user: null } : null)
          setCommands(null)
          setSelected(null)
          setSessions([])
          setUsers([])
          setInviteUrl('')
          setNewOpen(false)
          setCloseTarget(null)
          setAuthStep('password')
        }
        throw failure
      }
    },
    [updateConfig],
  )

  const perform = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (failure) {
      setError(failure as Failure)
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const refresh = useCallback(
    async (silent = false) => {
      if (refreshing.current) return
      refreshing.current = true
      if (!silent) setLoading(true)
      try {
        const result = await request<{ sessions: Session[] }>('/api/sessions')
        // Ignore an outstanding list response after logout or session expiration.
        if (configRef.current?.user) {
          setSessions(result.sessions)
          setLastUpdated(
            new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          )
        }
      } catch (failure) {
        setError(failure as Failure)
      } finally {
        refreshing.current = false
        setLoading(false)
      }
    },
    [request],
  )

  const loadRoute = useCallback(async () => {
    setError(null)
    if (path === '/invite') {
      await perform(async () =>
        setInvite(await request<Invite>(`/api/invite?${new URLSearchParams({ token })}`)),
      )
    } else if (!configRef.current?.user || commands) return
    else if (path === '/users')
      await perform(async () => setUsers((await request<{ users: Account[] }>('/api/users')).users))
    else if (path.startsWith('/session/')) {
      setSelected(null)
      await perform(async () => setSelected(await request<Detail>(`/api${path}`)))
    } else await refresh()
  }, [path, token, commands, perform, request, refresh])

  useEffect(() => {
    let active = true
    api<Config>('/api/bootstrap')
      .then((value) => {
        if (active) updateConfig(value)
      })
      .catch((failure) => {
        if (active) setError(failure)
      })
      .finally(() => {
        if (active) setBooting(false)
      })
    return () => {
      active = false
    }
  }, [updateConfig])
  useEffect(() => {
    if (!booting) void loadRoute()
  }, [booting, config?.user?.login, loadRoute])
  useEffect(() => {
    const pop = () => {
      setCommands(null)
      setInviteUrl('')
      setPath(currentPath())
      setToken(new URLSearchParams(location.search).get('token') || '')
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
  useEffect(() => {
    if (!config?.user || view !== 'dashboard') return
    const poll = setInterval(() => {
      if (!document.hidden && !busyRef.current && !newOpen && !closeTarget) void refresh(true)
    }, 15000)
    return () => clearInterval(poll)
  }, [config?.user, view, newOpen, closeTarget, refresh])

  function navigate(to: string) {
    if (busyRef.current) return
    setCommands(null)
    setInviteUrl('')
    setPath(to)
    history.pushState({}, '', `/connect${to}`)
    // Clicking the current navigation item should still refresh its data.
    if (to === path && !commands) void loadRoute()
  }
  async function login(credentials: { username: string; password: string; totp: string }) {
    return perform(async () => {
      const value = await request<{ step: string }>(
        authStep === 'totp' ? '/login/local/totp' : '/login/local',
        credentials,
      )
      if (value.step === 'totp') setAuthStep('totp')
      else {
        updateConfig(await request<Config>('/api/bootstrap'))
        setPath('/')
        history.replaceState({}, '', '/connect/')
      }
    })
  }
  async function logout() {
    await perform(async () => {
      await request('/api/logout', {})
      updateConfig(configRef.current ? { ...configRef.current, user: null } : null)
      setCommands(null)
      setSessions([])
      setUsers([])
      setInviteUrl('')
      setSelected(null)
      setAuthStep('password')
      setPath('/')
      history.replaceState({}, '', '/connect/')
    })
  }
  async function createSession(data: { customer: string; purpose: string }) {
    return perform(async () => {
      const value = await request<Commands>('/api/session', data)
      setCommands(value)
      setPath(`/session/${value.id}`)
      setNewOpen(false)
      history.pushState({}, '', `/connect/session/${value.id}`)
    })
  }
  async function switchPlatform(field: 'platform' | 'operator_platform', value: Platform) {
    if (!commands || commands[field] === value) return
    await perform(async () => {
      setCommands(
        await request<Commands>(`/api/session/${commands.id}/platform`, {
          ...commands,
          current_platform: commands.platform,
          [field]: value,
        }),
      )
    })
  }
  async function closeSession() {
    if (!closeTarget) return
    const success = await perform(async () => {
      await request(`/api/session/${closeTarget.id}/close`, {})
      setCloseTarget(null)
      setCommands(null)
      if (path.startsWith('/session/'))
        setSelected(await request<Detail>(`/api/session/${closeTarget.id}`))
    })
    if (success && view === 'dashboard') await refresh()
  }
  async function submitInvite(data: { password: string; confirm_password: string; totp: string }) {
    if (!invite) return false
    return perform(async () =>
      setInvite(await request<Invite>(`/api/invite/${invite.step}`, { token, ...data })),
    )
  }
  async function inviteUser(data: { username: string; display_name: string; role: string }) {
    await perform(async () =>
      setInviteUrl((await request<{ invite_url: string }>('/api/users/invite', data)).invite_url),
    )
  }
  async function userAction(account: Account, action: string) {
    return perform(async () => {
      const result = await request<{ invite_url?: string }>(
        `/api/users/${account.username}/${action}`,
        {},
      )
      if (result.invite_url) setInviteUrl(result.invite_url)
      setUsers((await request<{ users: Account[] }>('/api/users')).users)
    })
  }
  return {
    config,
    user: config?.user,
    view,
    booting,
    busy,
    loading,
    error,
    setError,
    sessions,
    users,
    selected,
    commands,
    invite,
    inviteUrl,
    authStep,
    setAuthStep,
    newOpen,
    setNewOpen,
    closeTarget,
    setCloseTarget,
    lastUpdated,
    navigate,
    refresh,
    loadRoute,
    login,
    logout,
    createSession,
    switchPlatform,
    closeSession,
    submitInvite,
    inviteUser,
    userAction,
  }
}
export type ConsoleModel = ReturnType<typeof useConsole>
