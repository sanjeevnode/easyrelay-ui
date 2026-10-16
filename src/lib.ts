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

export function statusClass(status: number | null, relayError: string | null) {
  if (relayError) return 'relay'
  if (status === null) return 'bad'
  return status >= 500 ? 'bad' : status >= 400 ? 'warn' : 'ok'
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
