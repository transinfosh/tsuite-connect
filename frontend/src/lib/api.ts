import type { Failure } from './types'

export async function api<T>(
  endpoint: string,
  data?: Record<string, unknown>,
  csrf?: string,
): Promise<T> {
  const options: RequestInit = {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(40000),
  }
  if (data) {
    options.method = 'POST'
    options.body = new URLSearchParams(
      Object.entries({ ...data, ...(csrf ? { csrf } : {}) })
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, String(value)]),
    )
  }
  let response: Response
  try {
    response = await fetch(`/connect${endpoint}`, options)
  } catch {
    throw {
      message: '网络连接中断或请求超时。操作结果尚未确认，请刷新会话状态后重试。',
      code: 'network_error',
    } satisfies Failure
  }
  let value
  try {
    value = await response.json()
  } catch {
    throw {
      message: '服务未返回有效数据，请联系管理员检查控制服务。',
      code: 'invalid_response',
    } satisfies Failure
  }
  if (!response.ok) throw value.error || { message: `请求失败（HTTP ${response.status}）` }
  return value as T
}
