export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = 'NETWORK_ERROR',
    public requestId = '',
  ) {
    super(requestId ? `${message}（请求编号：${requestId}）` : message)
  }
}
type Options = { method?: string; body?: unknown; signal?: AbortSignal; response?: 'json' | 'blob' }
type Csrf = { token: string; headerName: string }
let csrf: Promise<Csrf> | undefined
export const resetCsrf = () => {
  csrf = undefined
}
export async function refreshCsrf() {
  resetCsrf()
  return getCsrf()
}
function getCsrf(): Promise<Csrf> {
  csrf ??= api<Csrf>('/auth/csrf').catch((error: unknown) => {
    resetCsrf()
    throw error
  })
  return csrf
}
export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const writing = !['GET', 'HEAD'].includes(method)
  const headers = new Headers()
  if (writing) {
    const token = await getCsrf()
    headers.set(token.headerName, token.token)
  }
  let body: BodyInit | undefined
  if (options.body instanceof FormData || options.body instanceof URLSearchParams)
    body = options.body
  else if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError(
      writing
        ? '网络连接失败，操作结果可能尚未确认，请刷新核实后再操作'
        : '无法连接后端，请检查服务后重试',
    )
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      code?: string
      message?: string
      requestId?: string
    }
    if (response.status === 401) {
      resetCsrf()
      if (!path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'))
    }
    if (detail.code === 'CSRF_INVALID') resetCsrf()
    const fallback =
      response.status === 401
        ? '请重新登录'
        : response.status === 403
          ? '当前账号无操作权限或会话验证已过期'
          : `请求失败（${response.status}）`
    throw new ApiError(detail.message ?? fallback, response.status, detail.code, detail.requestId)
  }
  if (response.status === 204) return undefined as T
  if (response.headers.get('Content-Type')?.includes('text/html'))
    throw new ApiError(
      '接口返回了网页，请检查 /api 反向代理配置',
      response.status,
      'INVALID_RESPONSE',
    )
  if (options.response === 'blob') return (await response.blob()) as T
  if (!response.headers.get('Content-Type')?.includes('application/json'))
    throw new ApiError(
      '接口未返回 JSON，请检查 /api 反向代理配置',
      response.status,
      'INVALID_RESPONSE',
    )
  return response.json() as Promise<T>
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
