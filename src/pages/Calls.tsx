import { useState, type FormEvent } from 'react'
import { api, type Body, type CallDetail, type CallSummary, type Consumer, type Route } from '../api'
import { ErrorBox } from '../ui'
import { errorText, fmtDate, statusClass, useLoad } from '../lib'

const PAGE = 50
const EMPTY = {
  route_id: '',
  consumer_id: '',
  method: '',
  path_prefix: '',
  status_code: '',
  min_status: '',
  only_relay_errors: false,
  since: '',
  until: '',
}

const iso = (local: string) => (local ? new Date(local).toISOString() : undefined)

export default function Calls() {
  const lookups = useLoad(
    () => Promise.all([api<Route[]>('/admin/routes'), api<Consumer[]>('/admin/consumers')]),
    [],
  )
  const [routes, consumers] = lookups.data ?? [[], []]
  const [filters, setFilters] = useState(EMPTY)
  const [calls, setCalls] = useState<CallSummary[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<CallDetail | null>(null)

  const search = async (before?: string) => {
    setError(null)
    try {
      const page = await api<CallSummary[]>('/calls', {
        params: { ...filters, since: iso(filters.since), until: iso(filters.until), before_id: before, limit: PAGE },
      })
      setCalls(before ? [...(calls ?? []), ...page] : page)
      setMore(page.length === PAGE)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setDetail(null)
    void search()
  }

  const open = async (id: string) => {
    try {
      setDetail(await api<CallDetail>(`/calls/${id}`))
    } catch (e) {
      setError(errorText(e))
    }
  }

  const set = (k: keyof typeof EMPTY, v: string | boolean) => setFilters({ ...filters, [k]: v })
  const slug = (id: string) => routes.find((r) => r.id === id)?.slug ?? id.slice(0, 8)

  return (
    <section>
      <h2>Calls</h2>
      <form className="card filters" onSubmit={submit}>
        <select value={filters.route_id} onChange={(e) => set('route_id', e.target.value)}>
          <option value="">any route</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.slug}</option>)}
        </select>
        <select value={filters.consumer_id} onChange={(e) => set('consumer_id', e.target.value)}>
          <option value="">any consumer</option>
          {consumers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.method} onChange={(e) => set('method', e.target.value)}>
          <option value="">any method</option>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => <option key={m}>{m}</option>)}
        </select>
        <input placeholder="path starts with" value={filters.path_prefix} onChange={(e) => set('path_prefix', e.target.value)} />
        <input type="number" placeholder="status" value={filters.status_code} onChange={(e) => set('status_code', e.target.value)} />
        <input type="number" placeholder="status ≥" value={filters.min_status} onChange={(e) => set('min_status', e.target.value)} />
        <label className="inline">
          from <input type="datetime-local" value={filters.since} onChange={(e) => set('since', e.target.value)} />
        </label>
        <label className="inline">
          to <input type="datetime-local" value={filters.until} onChange={(e) => set('until', e.target.value)} />
        </label>
        <label className="inline">
          <input type="checkbox" checked={filters.only_relay_errors} onChange={(e) => set('only_relay_errors', e.target.checked)} />
          relay errors only
        </label>
        <button>Search</button>
        <button type="button" onClick={() => setFilters(EMPTY)}>Reset</button>
      </form>
      <ErrorBox error={lookups.error ?? error} />

      <div className={detail ? 'split' : ''}>
        <div>
          {calls && (
            <table className="calls">
              <thead>
                <tr><th>Time</th><th>Route</th><th>Request</th><th>Result</th><th>ms</th></tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} onClick={() => open(c.id)} className={detail?.id === c.id ? 'selected clickable' : 'clickable'}>
                    <td>{fmtDate(c.started_at)}</td>
                    <td>{slug(c.route_id)}</td>
                    <td><code>{c.method} {c.path}{c.query ? `?${c.query}` : ''}</code></td>
                    <td><Result call={c} /></td>
                    <td>{c.duration_ms}</td>
                  </tr>
                ))}
                {!calls.length && <tr><td colSpan={5}><em>No calls match.</em></td></tr>}
              </tbody>
            </table>
          )}
          {more && calls && <button onClick={() => search(calls[calls.length - 1].id)}>Load older</button>}
        </div>
        {detail && <Detail call={detail} onClose={() => setDetail(null)} />}
      </div>
    </section>
  )
}

const Result = ({ call }: { call: CallSummary }) => (
  <span className={`badge ${statusClass(call.status_code, call.relay_error)}`}>
    {call.relay_error ? `relay: ${call.relay_error}` : (call.status_code ?? 'no response')}
  </span>
)

function Detail({ call, onClose }: { call: CallDetail; onClose: () => void }) {
  return (
    <aside className="card detail">
      <div className="row between">
        <h3>{call.method} {call.path}</h3>
        <button onClick={onClose}>Close</button>
      </div>
      <dl>
        <dt>Result</dt><dd><Result call={call} /> {call.status_code !== null && call.relay_error && `(upstream ${call.status_code})`}</dd>
        <dt>Upstream URL</dt><dd><code>{call.upstream_url}</code></dd>
        <dt>Started</dt><dd>{fmtDate(call.started_at)} · {call.duration_ms} ms</dd>
        <dt>Sizes</dt><dd>req {call.request_size} B · res {call.response_size ?? '—'} B</dd>
        <dt>Client IP</dt><dd>{call.client_ip ?? '—'}</dd>
        <dt>Call id</dt><dd><code>{call.id}</code></dd>
      </dl>
      <h4>Request headers</h4>
      <Headers headers={call.request_headers} />
      <h4>Request body</h4>
      <BodyView body={call.request_body} />
      <h4>Response headers</h4>
      <Headers headers={call.response_headers} />
      <h4>Response body</h4>
      <BodyView body={call.response_body} />
    </aside>
  )
}

const Headers = ({ headers }: { headers: [string, string][] | null }) =>
  headers?.length ? (
    <pre>{headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
  ) : (
    <p className="hint">none</p>
  )

function BodyView({ body }: { body: Body | null }) {
  if (!body) return <p className="hint">not stored (route policy, empty, or not redactable)</p>
  if (body.encoding === 'base64') return <pre>base64: {body.content}</pre>
  let text = body.content
  try {
    text = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    /* not JSON: show as is */
  }
  // rendered as text, never as HTML: React escapes it
  return <pre>{text}</pre>
}
