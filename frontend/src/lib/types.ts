export type Platform = 'linux' | 'windows'
export type PlatformField = 'platform' | 'operator_platform'
export interface User {
  login: string
  name: string
  csrf: string
  is_admin: boolean
  auth_provider: string
  expires_at: number
}
export interface Config {
  user: User | null
  allowed_org: string
  allowed_team?: string
  session_ttl_seconds: number
  local_enabled: boolean
}
export interface Failure {
  message: string
  code?: string
  request_id?: string
}
export interface Session {
  id: string
  customer?: string
  status: string
  remote_port?: string
}
export interface Detail extends Session {
  fields: { key: string; label: string; value: string }[]
}
export interface Commands {
  id: string
  customer: string
  purpose: string
  platform: Platform
  operator_platform: Platform
  customer_command: string
  operator_command?: string
  ai_instructions?: string
  grant?: string
  customer_locked?: boolean
}
export interface Account {
  username: string
  display_name: string
  is_admin: number
  enabled: number
}
export interface Invite {
  username?: string
  step: 'password' | 'totp' | 'complete'
  secret?: string
  uri?: string
  qr?: string
}
export const statusLabels: Record<string, string> = {
  issued: '等待客户',
  enrolled: '已连接',
  revoking: '正在关闭',
  closed: '已关闭',
  expired: '已过期',
}
