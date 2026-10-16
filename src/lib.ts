import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await run())
      setError(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, loading, reload }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = Array.isArray(e.details)
      ? (e.details as { field: string; message: string }[])
          .map((d) => `${d.field}: ${d.message}`)
          .join('; ')
      : ''
    return fields ? `${e.message} — ${fields}` : e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')

export type Tone = 'ok' | 'info' | 'client' | 'fault' | 'relay' | 'idle'

export function statusTone(status: number | null): Tone {
  if (status === null) return 'idle'
  if (status >= 500) return 'fault'
  if (status >= 400) return 'client'
  if (status >= 300) return 'info'
  return 'ok'
}

export const errorLabel = (code: string) => code.replaceAll('_', ' ')

// relay errors raised before the upstream was ever called
const BEFORE_UPSTREAM = new Set([
  'path_not_allowed',
  'bad_path',
  'request_too_large',
  'route_disabled',
  'route_not_found',
])
const UPSTREAM_FAILED = new Set(['upstream_timeout', 'upstream_unreachable'])

export type Trace = {
  relay: Tone
  upstream: Tone
  link: 'ok' | 'broken' | 'none'
  summary: string
}

/** Where along consumer → relay → upstream a call got to, and who stopped it. */
export function traceOf(c: { status_code: number | null; relay_error: string | null }): Trace {
  const err = c.relay_error
  if (err && BEFORE_UPSTREAM.has(err))
    return { relay: 'relay', upstream: 'idle', link: 'none', summary: `Stopped at the relay: ${errorLabel(err)}. The upstream was never called.` }
  if (err && UPSTREAM_FAILED.has(err))
    return { relay: 'ok', upstream: 'fault', link: 'broken', summary: `The relay got no answer from the upstream: ${errorLabel(err)}.` }
  if (err)
    return {
      relay: 'relay',
      upstream: statusTone(c.status_code),
      link: 'ok',
      summary: `The upstream answered ${c.status_code ?? ''}, but the relay held the response back: ${errorLabel(err)}.`,
    }
  return { relay: 'ok', upstream: statusTone(c.status_code), link: 'ok', summary: `The upstream answered ${c.status_code}.` }
}

export function fmtBytes(n: number | null) {
  if (n === null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`)

export function fmtClock(s: string) {
  const d = new Date(s)
  const today = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return today ? time : `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${time}`
}

export function splitUrl(url: string) {
  try {
    const u = new URL(url)
    return { origin: u.origin, rest: u.pathname + u.search }
  } catch {
    return { origin: '', rest: url }
  }
}

/** [[name, value], ...] → {name: value}; a repeated header (Set-Cookie) becomes an array. */
export function headersToObject(headers: [string, string][]) {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of headers) {
    const prev = out[k]
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
  }
  return out
}

const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`
const SKIP_IN_CURL = new Set(['host', 'content-length', 'connection', 'x-relay-key', 'accept-encoding'])

/** cURL that replays the call straight at the upstream. Masked credentials stay masked. */
export function toCurl(c: {
  method: string
  upstream_url: string
  request_headers: [string, string][]
  request_body: { encoding: string; content: string } | null
}) {
  const parts = [`curl -X ${c.method} ${shellQuote(c.upstream_url)}`]
  for (const [k, v] of c.request_headers) {
    if (!SKIP_IN_CURL.has(k.toLowerCase())) parts.push(`-H ${shellQuote(`${k}: ${v === '***' ? '<redacted>' : v}`)}`)
  }
  if (c.request_body?.encoding === 'utf-8') parts.push(`--data-raw ${shellQuote(c.request_body.content)}`)
  return parts.join(' \\\n  ')
}

// Runs an action, reports its error, and tells the caller if it worked.
export function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run }
}

export type Device = 'mobile' | 'tablet' | 'desktop'

const PHONE_UA = /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i
const TABLET_UA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i

/**
 * Not width alone: a phone in landscape is wide, and a desktop window can be narrow.
 * Combines the browser's own mobile hint, the user agent, touch input and the
 * device's physical screen, then falls back to window width so a narrow desktop
 * window still gets a usable layout.
 */
export function detectDevice(): Device {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  const ua = nav.userAgent
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  const touch = coarse || nav.maxTouchPoints > 0
  const shortSide = Math.min(window.screen.width, window.screen.height)
  const ipadAsMac = /Macintosh/.test(ua) && nav.maxTouchPoints > 1 // iPadOS reports a desktop UA

  const phone = nav.userAgentData?.mobile === true || PHONE_UA.test(ua) || (touch && noHover && shortSide < 600)
  if (phone || window.innerWidth < 640) return 'mobile'

  const tablet = TABLET_UA.test(ua) || ipadAsMac || (touch && noHover && shortSide < 1100)
  if (tablet || window.innerWidth < 1024) return 'tablet'
  return 'desktop'
}

/** Current device class; re-evaluated on resize, rotation and input-device changes. */
export function useDevice(): Device {
  const [device, setDevice] = useState<Device>(detectDevice)
  useEffect(() => {
    const update = () => setDevice(detectDevice())
    const queries = ['(pointer: coarse)', '(hover: none)'].map((q) => window.matchMedia(q))
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    queries.forEach((q) => q.addEventListener('change', update))
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      queries.forEach((q) => q.removeEventListener('change', update))
    }
  }, [])
  return device
}
