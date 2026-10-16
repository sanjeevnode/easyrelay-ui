import { useState } from 'react'
import { api, type Consumer, type Route, type RouteMetrics, type Upstream } from '../api'
import { ErrorBox, PageHeader } from '../ui'
import { fmtMs, useLoad } from '../lib'

const WINDOWS = { '1 hour': 1, '24 hours': 24, '7 days': 24 * 7 }

const pct = (n: number, of: number) => (of ? (n / of) * 100 : 0)

export default function Metrics() {
  const [hours, setHours] = useState(24)
  const data = useLoad(
    () =>
      Promise.all([
        api<RouteMetrics[]>('/calls/metrics', { params: { since: new Date(Date.now() - hours * 3600_000).toISOString() } }),
        api<Route[]>('/admin/routes'),
        api<Consumer[]>('/admin/consumers'),
        api<Upstream[]>('/admin/upstreams'),
      ]),
    [hours],
  )
  const [metrics, routes, consumers, upstreams] = data.data ?? [[], [], [], []]
  const route = (id: string) => routes.find((r) => r.id === id)
  const name = (list: { id: string; name: string }[], id?: string) => list.find((x) => x.id === id)?.name ?? '…'

  const calls = metrics.reduce((n, m) => n + m.calls, 0)
  const upstreamErrors = metrics.reduce((n, m) => n + m.upstream_errors, 0)
  const relayErrors = metrics.reduce((n, m) => n + m.relay_errors, 0)
  const worstP95 = metrics.reduce((n, m) => Math.max(n, m.p95_ms), 0)

  return (
    <section>
      <PageHeader title="Metrics" sub="How each upstream is doing, as its real consumers see it.">
        <div className="segmented" role="group" aria-label="Time window">
          {Object.entries(WINDOWS).map(([label, h]) => (
            <button key={label} className={h === hours ? 'on' : ''} aria-pressed={h === hours} onClick={() => setHours(h)}>
              {label}
            </button>
          ))}
        </div>
        <button className="refresh" onClick={() => void data.reload()} disabled={data.loading} aria-busy={data.loading}>Refresh</button>
      </PageHeader>
      <ErrorBox error={data.error} />

      <div className={`stats ${data.loading ? 'busy' : ''}`}>
        <Stat label="Calls" value={calls.toLocaleString()} />
        <Stat label="Upstream 5xx" value={`${pct(upstreamErrors, calls).toFixed(1)}%`} detail={`${upstreamErrors} calls`} tone={upstreamErrors ? 'fault' : undefined} />
        <Stat label="Refused by relay" value={`${pct(relayErrors, calls).toFixed(1)}%`} detail={`${relayErrors} calls`} tone={relayErrors ? 'relay' : undefined} />
        <Stat label="Slowest p95" value={calls ? fmtMs(Math.round(worstP95)) : '—'} detail="across routes" />
      </div>

      <div className={`table-wrap ${data.loading ? 'busy' : ''}`}>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th className="num">Calls</th>
              <th>Upstream 5xx</th>
              <th>Refused by relay</th>
              <th className="num">Avg</th>
              <th className="num">p95</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const r = route(m.route_id)
              return (
                <tr key={m.route_id}>
                  <td data-label="Route">
                    <div className="mono strong">{r?.slug ?? m.route_id}</div>
                    <div className="muted small">{name(consumers, r?.consumer_id)} → {name(upstreams, r?.upstream_id)}</div>
                  </td>
                  <td data-label="Calls" className="num mono">{m.calls.toLocaleString()}</td>
                  <td data-label="Upstream 5xx"><Rate n={m.upstream_errors} of={m.calls} tone="fault" /></td>
                  <td data-label="Refused by relay"><Rate n={m.relay_errors} of={m.calls} tone="relay" /></td>
                  <td data-label="Avg" className="num mono">{fmtMs(Math.round(m.avg_ms))}</td>
                  <td data-label="p95" className="num mono">{fmtMs(Math.round(m.p95_ms))}</td>
                </tr>
              )
            })}
            {data.data && !metrics.length && (
              <tr><td colSpan={6} className="empty">No calls in this window. Try a longer one.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const Stat = ({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'fault' | 'relay' }) => (
  <div className={`stat ${tone ? `tone-${tone}` : ''}`}>
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {detail && <span className="stat-detail">{detail}</span>}
  </div>
)

const Rate = ({ n, of, tone }: { n: number; of: number; tone: 'fault' | 'relay' }) => {
  const p = pct(n, of)
  return (
    <div className={`rate tone-${tone}`} title={`${n} of ${of} calls`}>
      <span className="bar"><i style={{ width: `${Math.max(p, n ? 2 : 0)}%` }} /></span>
      <span className="mono small">{p.toFixed(1)}%</span>
    </div>
  )
}
