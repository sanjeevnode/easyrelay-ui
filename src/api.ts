// Thin client for the EasyRelay admin + search API. Same-origin only: in dev Vite
// proxies /admin and /calls to the backend, in production a reverse proxy does.

const KEY_STORAGE = 'easyrelay.adminKey'

// sessionStorage: survives a reload, gone when the tab closes. Never localStorage.
let adminKey: string | null = (() => {
  try {
    return sessionStorage.getItem(KEY_STORAGE)
  } catch {
    return null
  }
})()

let onUnauthorized: () => void = () => {}

export function setAdminKey(key: string | null) {
  adminKey = key
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key)
    else sessionStorage.removeItem(KEY_STORAGE)
  } catch {
    /* storage blocked: key lives in memory only */
  }
}

export const hasAdminKey = () => !!adminKey
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn)

export class ApiError extends Error {
  status: number
  details: unknown
  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

type Params = Record<string, string | number | boolean | null | undefined>

export async function api<T>(
  path: string,
  { method = 'GET', body, params }: { method?: string; body?: unknown; params?: Params } = {},
): Promise<T> {
  const url = new URL(path, window.location.origin)
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '' && v !== false) url.searchParams.set(k, String(v))
  }
  const headers: Record<string, string> = { 'X-Admin-Key': adminKey ?? '' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401) onUnauthorized()
    throw new ApiError(json?.message ?? res.statusText, res.status, json?.data)
  }
  return json.data as T
}

// types mirror app/schemas on the backend

type Meta = { id: string; created_at: string; updated_at: string }

export type Consumer = Meta & { name: string; is_active: boolean }
export type Upstream = Meta & { name: string; base_url: string; is_active: boolean }
export type ApiKey = Meta & {
  consumer_id: string
  prefix: string
  label: string | null
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
}
export type LogBodies = 'never' | 'errors' | 'always'
export type RouteSettings = {
  allowlist: string[]
  timeout_ms: number
  max_request_bytes: number
  max_response_bytes: number
  log_bodies: LogBodies
  redact_fields: string[]
}
export type Route = Meta &
  RouteSettings & { slug: string; consumer_id: string; upstream_id: string; is_active: boolean }

export type CallSummary = {
  id: string
  route_id: string
  consumer_id: string
  api_key_id: string
  method: string
  path: string
  query: string | null
  upstream_url: string
  status_code: number | null
  relay_error: string | null
  duration_ms: number
  request_size: number
  response_size: number | null
  client_ip: string | null
  started_at: string
}
export type Body = { encoding: 'utf-8' | 'base64'; content: string }
export type CallDetail = CallSummary & {
  request_headers: [string, string][]
  response_headers: [string, string][] | null
  request_body: Body | null
  response_body: Body | null
}
export type RouteMetrics = {
  route_id: string
  calls: number
  upstream_errors: number
  relay_errors: number
  avg_ms: number
  p95_ms: number
}
