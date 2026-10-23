import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { transition } from './transition'
import type {
  Account,
  Commands,
  Config,
  Detail,
  Failure,
  Invite,
  Platform,
  PlatformField,
  Session,
} from './types'

const currentPath = () => location.pathname.replace(/^\/connect/, '') || '/'

export function useConsole() {
  const [config, setConfig] = useState<Config | null>(null)
  const configRef = useRef(config)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [users, setUsers] = useState<Account[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [path, setPath] = useState(currentPath)
  const [navigating, setNavigating] = useState<string | null>(null)
  const routeSequence = useRef(0)
  const pendingRead = useRef<number | null>(null)
  const routePath = useRef(path)
  const [selected, setSelected] = useState<Detail | null>(null)
  const [commands, setCommands] = useState<Commands | null>(null)
  const [platformPending, setPlatformPending] = useState<Partial<Record<PlatformField, Platform>>>(
    {},
  )
  const platformQueue = useRef<{ field: PlatformField; value: Platform }[]>([])
  const switchingPlatforms = useRef(false)
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
      const identity = configRef.current?.user
      try {
        return await api<T>(endpoint, data, configRef.current?.user?.csrf)
      } catch (failure) {
        if (
          (failure as Failure).code === 'login_required' &&
          identity === configRef.current?.user
        ) {
          updateConfig(configRef.current ? { ...configRef.current, user: null } : null)
          setCommands(null)
          setSelected(null)
          setSessions([])
          setUsers([])
          setInviteUrl('')
          setNewOpen(false)
          setCloseTarget(null)
          setAuthStep('password')
          routeSequence.current += 1
          setNavigating(null)
          setLoading(false)
          setSessionsLoaded(false)
          setUsersLoaded(false)
          setError(failure as Failure)
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

  // Route reads never hold the mutation lock or delay navigation. Responses from
  // an abandoned route (or a previous identity) cannot update the active screen.
  const loadRoute = useCallback(
    async (silent = false) => {
      if (path !== '/invite' && (!configRef.current?.user || commands)) return
      if (pendingRead.current === routeSequence.current) return
      const sequence = ++routeSequence.current
      pendingRead.current = sequence
      const identity = configRef.current?.user
      const current = () =>
        sequence === routeSequence.current &&
        routePath.current === path &&
        identity === configRef.current?.user
      if (!silent) {
        setNavigating(path)
        setLoading(path === '/')
        setError(null)
      }
      try {
        if (path === '/invite') {
          const value = await request<Invite>(`/api/invite?${new URLSearchParams({ token })}`)
          if (current()) setInvite(value)
        } else if (path === '/users') {
          const value = await request<{ users: Account[] }>('/api/users')
          if (current()) {
            setUsers(value.users)
            setUsersLoaded(true)
          }
        } else if (path.startsWith('/session/')) {
          const value = await request<Detail>(`/api${path}`)
          if (current()) setSelected(value)
        } else {
          const value = await request<{ sessions: Session[] }>('/api/sessions')
          if (current()) {
            setSessions(value.sessions)
            setSessionsLoaded(true)
            setLastUpdated(
              new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            )
          }
        }
      } catch (failure) {
        if (current()) setError(failure as Failure)
      } finally {
        if (current()) {
          pendingRead.current = null
          setNavigating(null)
          setLoading(false)
        }
      }
    },
    [path, token, commands, request],
  )
  const refresh = useCallback((silent = false) => loadRoute(silent), [loadRoute])

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
    if (booting) return
    void loadRoute()
    return () => {
      routeSequence.current += 1
    }
  }, [booting, config?.user?.login, loadRoute])
  const navigate = useCallback(
    async (to: string, pushHistory = true) => {
      if (busyRef.current || (to === routePath.current && !commands)) return
      const sequence = ++routeSequence.current
      await transition(() => {
        if (sequence !== routeSequence.current) return
        routePath.current = to
        setCommands(null)
        setInviteUrl('')
        setSelected((detail) => (to === `/session/${detail?.id}` ? detail : null))
        setPath(to)
        setToken(new URLSearchParams(location.search).get('token') || '')
        setNavigating(to)
        setLoading(to === '/')
        setError(null)
        if (pushHistory && location.pathname !== `/connect${to}`)
          history.pushState({}, '', `/connect${to}`)
      })
    },
    [commands],
  )
  useEffect(() => {
    const pop = () => {
      void navigate(currentPath(), false)
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [navigate])
  useEffect(() => {
    if (!config?.user || view !== 'dashboard') return
    const poll = setInterval(() => {
      if (!document.hidden && !busyRef.current && !newOpen && !closeTarget) void refresh(true)
    }, 15000)
    return () => clearInterval(poll)
  }, [config?.user, view, newOpen, closeTarget, refresh])

  async function login(credentials: { username: string; password: string; totp: string }) {
    return perform(async () => {
      const value = await request<{ step: string }>(
        authStep === 'totp' ? '/login/local/totp' : '/login/local',
        credentials,
      )
      if (value.step === 'totp') await transition(() => setAuthStep('totp'))
      else {
        const config = await request<Config>('/api/bootstrap')
        await transition(() => {
          updateConfig(config)
          routePath.current = '/'
          setNavigating('/')
          setLoading(true)
          setPath('/')
          history.replaceState({}, '', '/connect/')
        })
      }
    })
  }
  async function logout() {
    await perform(async () => {
      await request('/api/logout', {})
      await transition(() => {
        updateConfig(configRef.current ? { ...configRef.current, user: null } : null)
        setCommands(null)
        setSessions([])
        setUsers([])
        setInviteUrl('')
        setSelected(null)
        setAuthStep('password')
        routeSequence.current += 1
        routePath.current = '/'
        setNavigating(null)
        setLoading(false)
        setSessionsLoaded(false)
        setUsersLoaded(false)
        setPath('/')
        history.replaceState({}, '', '/connect/')
      })
    })
  }
  async function createSession(data: { customer: string; purpose: string }) {
    return perform(async () => {
      const value = await request<Commands>('/api/session', data)
      await transition(() => {
        routeSequence.current += 1
        routePath.current = `/session/${value.id}`
        setNavigating(null)
        setLoading(false)
        setCommands(value)
        setPath(`/session/${value.id}`)
        setNewOpen(false)
        history.pushState({}, '', `/connect/session/${value.id}`)
      })
    })
  }
  async function switchPlatform(field: PlatformField, value: Platform) {
    if (
      !commands ||
      commands[field] === value ||
      platformQueue.current.some((job) => job.field === field)
    )
      return
    if (busyRef.current && !switchingPlatforms.current) return
    platformQueue.current.push({ field, value })
    setPlatformPending((pending) => ({ ...pending, [field]: value }))
    if (switchingPlatforms.current) return
    switchingPlatforms.current = true
    try {
      await perform(async () => {
        // The API accepts both platforms and a version check. Apply independent
        // choices against the latest confirmed response so neither overwrites the other.
        let current = commands
        while (platformQueue.current.length) {
          const job = platformQueue.current[0]
          current = await request<Commands>(`/api/session/${current.id}/platform`, {
            ...current,
            current_platform: current.platform,
            [job.field]: job.value,
          })
          await transition(() => setCommands(current))
          platformQueue.current.shift()
          setPlatformPending((pending) => {
            const next = { ...pending }
            delete next[job.field]
            return next
          })
        }
      })
    } finally {
      // A failed mutation can have an unknown result; never replay queued choices.
      if (platformQueue.current.length > 1)
        setError((failure) =>
          failure
            ? {
                ...failure,
                message: `${failure.message} 后续系统选择尚未提交，请确认状态后重新选择。`,
              }
            : failure,
        )
      platformQueue.current = []
      switchingPlatforms.current = false
      setPlatformPending({})
    }
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
    return perform(async () => {
      const value = await request<Invite>(`/api/invite/${invite.step}`, { token, ...data })
      await transition(() => setInvite(value))
    })
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
    navigating,
    error,
    setError,
    sessions,
    users,
    sessionsLoaded,
    usersLoaded,
    selected,
    commands,
    platformPending,
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
