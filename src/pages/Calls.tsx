import { useEffect, useState } from 'react'
import { api, type Body, type CallDetail, type CallPage, type CallSummary, type Consumer, type Route } from '../api'
import { Badge, Drawer, ErrorBox, HopTrace, PageHeader } from '../ui'
import {
  errorLabel,
  errorText,
  fmtBytes,
  fmtClock,
  fmtDate,
  fmtMs,
  splitUrl,
  statusTone,
  toCurl,
  traceOf,
  useLoad,
} from '../lib'

const PAGE_SIZE = 30
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const OUTCOMES = {
  all: { label: 'All', params: {} },
  '2xx': { label: '2xx', params: { min_status: 200, max_status: 299 } },
  '3xx': { label: '3xx', params: { min_status: 300, max_status: 399 } },
  '4xx': { label: '4xx', params: { min_status: 400, max_status: 499 } },
  '5xx': { label: '5xx', params: { min_status: 500, max_status: 599 } },
  relay: { label: 'Relay errors', params: { only_relay_errors: true } },
} as const
type Outcome = keyof typeof OUTCOMES

const iso = (local: string) => (local ? new Date(local).toISOString() : undefined)

export default function Calls() {
  const lookups = useLoad(() => Promise.all([api<Route[]>('/admin/routes'), api<Consumer[]>('/admin/consumers')]), [])
  const [routes, consumers] = lookups.data ?? [[], []]

  const [q, setQ] = useState('')
  const [query, setQuery] = useState('') // debounced q
  const [routeId, setRouteId] = useState('')
  const [consumerId, setConsumerId] = useState('')
  const [method, setMethod] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('all')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [page, setPage] = useState(1)
  const [refreshTick, setRefreshTick] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  // any filter change starts again from page 1
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  const result = useLoad(
    () =>
      api<CallPage>('/calls', {
        params: {
          q: query,
          route_id: routeId,
          consumer_id: consumerId,
          method,
          since: iso(since),
          until: iso(until),
          page,
          page_size: PAGE_SIZE,
          ...OUTCOMES[outcome].params,
        },
      }),
    [query, routeId, consumerId, method, outcome, since, until, page, refreshTick],
  )

  const data = result.data
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const first = data && data.total ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = data ? Math.min(page * PAGE_SIZE, data.total) : 0
  const filtered = !!(q || routeId || consumerId || method || outcome !== 'all' || since || until)
  const slug = (id: string) => routes.find((r) => r.id === id)?.slug ?? '…'
  const consumerName = (id: string) => consumers.find((c) => c.id === id)?.name ?? '…'

  const reset = () => {
    setQ('')
    setRouteId('')
    setConsumerId('')
    setMethod('')
    setOutcome('all')
    setSince('')
    setUntil('')
    setPage(1)
  }

  return (
    <section>
      <PageHeader title="Calls" sub="Every request that went through the relay, newest first.">
        <button onClick={() => setRefreshTick((t) => t + 1)} disabled={result.loading}>
          {result.loading ? 'Loading…' : 'Refresh'}
        </button>
      </PageHeader>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search request URLs, e.g. /books/42 or api.vendor.com"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search request URLs"
        />
        <select value={routeId} onChange={(e) => filter(setRouteId)(e.target.value)} aria-label="Route">
          <option value="">All routes</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.slug}</option>)}
        </select>
        <select value={consumerId} onChange={(e) => filter(setConsumerId)(e.target.value)} aria-label="Consumer">
          <option value="">All consumers</option>
          {consumers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={method} onChange={(e) => filter(setMethod)(e.target.value)} aria-label="Method">
          <option value="">All methods</option>
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="toolbar secondary">
        <div className="segmented" role="group" aria-label="Outcome">
          {(Object.keys(OUTCOMES) as Outcome[]).map((o) => (
            <button key={o} className={o === outcome ? 'on' : ''} aria-pressed={o === outcome} onClick={() => filter(setOutcome)(o)}>
              {OUTCOMES[o].label}
            </button>
          ))}
        </div>
        <label className="inline">
          From <input type="datetime-local" value={since} onChange={(e) => filter(setSince)(e.target.value)} />
        </label>
        <label className="inline">
          To <input type="datetime-local" value={until} onChange={(e) => filter(setUntil)(e.target.value)} />
        </label>
        {filtered && <button className="ghost" onClick={reset}>Clear filters</button>}
      </div>

      <ErrorBox error={lookups.error ?? result.error} />

      <div className={`table-wrap ${result.loading ? 'busy' : ''}`}>
        <table className="calls">
          <thead>
            <tr>
              <th>Time</th>
              <th>Path</th>
              <th>Request URL</th>
              <th>Consumer · Route</th>
              <th>Result</th>
              <th className="num">Duration</th>
              <th className="num">Size</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => <Row key={c.id} call={c} route={slug(c.route_id)} consumer={consumerName(c.consumer_id)} onOpen={() => setOpenId(c.id)} />)}
            {data && !data.items.length && (
              <tr>
                <td colSpan={7} className="empty">
                  {filtered ? 'No calls match these filters. Clear them to see everything.' : 'No calls yet. Send a request through /relay/<route>/… and it shows up here.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <nav className="pager" aria-label="Pages">
          <span>
            <strong>{first}–{last}</strong> of <strong>{data.total.toLocaleString()}</strong>
          </span>
          <div className="pager-buttons">
            <button onClick={() => setPage(1)} disabled={page === 1}>First</button>
            <button onClick={() => setPage(page - 1)} disabled={page === 1}>Previous</button>
            <span className="page-no">Page {page} of {pages}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</button>
            <button onClick={() => setPage(pages)} disabled={page >= pages}>Last</button>
          </div>
        </nav>
      )}

      {openId && <CallDrawer id={openId} route={slug} consumer={consumerName} onClose={() => setOpenId(null)} />}
    </section>
  )
}

function Result({ call }: { call: CallSummary }) {
  if (call.relay_error) return <Badge tone="relay">{errorLabel(call.relay_error)}</Badge>
  return <Badge tone={statusTone(call.status_code)}>{call.status_code ?? 'no response'}</Badge>
}

function Row({ call, route, consumer, onOpen }: { call: CallSummary; route: string; consumer: string; onOpen: () => void }) {
  const url = splitUrl(call.upstream_url)
  return (
    <tr className="clickable" onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} tabIndex={0}>
      <td className="mono nowrap" title={fmtDate(call.started_at)}>{fmtClock(call.started_at)}</td>
      <td><HopTrace trace={traceOf(call)} /></td>
      <td className="url">
        <span className={`method m-${call.method.toLowerCase()}`}>{call.method}</span>
        <span className="mono" title={call.upstream_url}>
          <span className="origin">{url.origin}</span>
          {url.rest}
        </span>
      </td>
      <td className="nowrap">
        {consumer} <span className="muted">· {route}</span>
      </td>
      <td><Result call={call} /></td>
      <td className="num mono">{fmtMs(call.duration_ms)}</td>
      <td className="num mono">{fmtBytes(call.response_size)}</td>
    </tr>
  )
}

function CallDrawer({ id, route, consumer, onClose }: { id: string; route: (id: string) => string; consumer: (id: string) => string; onClose: () => void }) {
  const detail = useLoad(() => api<CallDetail>(`/calls/${id}`), [id])
  const [tab, setTab] = useState<'request' | 'response'>('request')
  const [copied, setCopied] = useState<string | null>(null)
  const c = detail.data

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    } catch (e) {
      setCopied(errorText(e))
    }
  }

  return (
    <Drawer label="Call details" onClose={onClose}>
      <header className="drawer-head">
        <div>
          <span className="eyebrow">Call</span>
          <h2 className="mono">{c ? `${c.method} ${c.path}` : '…'}</h2>
        </div>
        <button className="ghost" onClick={onClose} aria-label="Close details">Close</button>
      </header>
      <ErrorBox error={detail.error} />
      {c && (
        <div className="drawer-body">
          <HopTrace trace={traceOf(c)} labels={[consumer(c.consumer_id), 'Relay', splitUrl(c.upstream_url).origin.replace(/^https?:\/\//, '')]} />

          <dl className="facts">
            <dt>Result</dt>
            <dd><Result call={c} />{c.relay_error && c.status_code !== null && <span className="muted"> upstream said {c.status_code}</span>}</dd>
            <dt>Request URL</dt>
            <dd className="mono break">
              {c.upstream_url}
              <button className="link" onClick={() => copy('url', c.upstream_url)}>{copied === 'url' ? 'Copied' : 'Copy'}</button>
            </dd>
            <dt>Route</dt>
            <dd>{route(c.route_id)} <span className="muted">· consumer {consumer(c.consumer_id)}</span></dd>
            <dt>When</dt>
            <dd>{fmtDate(c.started_at)} <span className="muted">· took {fmtMs(c.duration_ms)}</span></dd>
            <dt>Sizes</dt>
            <dd className="mono">{fmtBytes(c.request_size)} sent · {fmtBytes(c.response_size)} received</dd>
            <dt>Client IP</dt>
            <dd className="mono">{c.client_ip ?? '—'}</dd>
            <dt>Call ID</dt>
            <dd className="mono break">{c.id}</dd>
          </dl>

          <button onClick={() => copy('curl', toCurl(c))}>{copied === 'curl' ? 'Copied cURL' : 'Copy as cURL'}</button>

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'request'} className={tab === 'request' ? 'on' : ''} onClick={() => setTab('request')}>Request</button>
            <button role="tab" aria-selected={tab === 'response'} className={tab === 'response' ? 'on' : ''} onClick={() => setTab('response')}>Response</button>
          </div>
          {tab === 'request' ? (
            <>
              <h3>Headers</h3>
              <Headers headers={c.request_headers} />
              <h3>Body</h3>
              <BodyView body={c.request_body} size={c.request_size} />
            </>
          ) : (
            <>
              <h3>Headers</h3>
              <Headers headers={c.response_headers} />
              <h3>Body</h3>
              <BodyView body={c.response_body} size={c.response_size} />
            </>
          )}
        </div>
      )}
    </Drawer>
  )
}

const Headers = ({ headers }: { headers: [string, string][] | null }) =>
  headers?.length ? (
    <table className="kv">
      <tbody>
        {headers.map(([k, v], i) => (
          <tr key={i}>
            <th>{k}</th>
            <td className={v === '***' ? 'masked' : ''}>{v === '***' ? 'hidden: credential' : v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="hint">No headers. The upstream never answered.</p>
  )

function BodyView({ body, size }: { body: Body | null; size: number | null }) {
  if (!size) return <p className="hint">Empty.</p>
  if (!body)
    return <p className="hint">Not stored. The route keeps bodies only for errors, or this body could not be redacted safely.</p>
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
