import { useState } from 'react'
import { api, type Route, type RouteMetrics } from '../api'
import { ErrorBox, PageHeader } from '../ui'
import { useLoad } from '../lib'

const WINDOWS = { '1 hour': 1, '24 hours': 24, '7 days': 24 * 7 }

export default function Metrics() {
  const [hours, setHours] = useState(24)
  const data = useLoad(
    () =>
      Promise.all([
        api<RouteMetrics[]>('/calls/metrics', {
          params: { since: new Date(Date.now() - hours * 3600_000).toISOString() },
        }),
        api<Route[]>('/admin/routes'),
      ]),
    [hours],
  )
  const [metrics, routes] = data.data ?? [[], []]
  const slug = (id: string) => routes.find((r) => r.id === id)?.slug ?? id
  const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '—')

  return (
    <section>
      <PageHeader title="Metrics" sub="How each route's upstream is doing, as its real consumers see it.">
        <div className="segmented">
          {Object.entries(WINDOWS).map(([label, h]) => (
            <button key={label} className={h === hours ? 'on' : ''} aria-pressed={h === hours} onClick={() => setHours(h)}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => void data.reload()}>Refresh</button>
      </PageHeader>
      <ErrorBox error={data.error} />
      <table>
        <thead>
          <tr>
            <th>Route</th><th className="num">Calls</th><th className="num">Upstream 5xx</th>
            <th className="num">Relay errors</th><th className="num">Avg ms</th><th className="num">p95 ms</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.route_id}>
              <td><code>{slug(m.route_id)}</code></td>
              <td className="num">{m.calls}</td>
              <td className="num">{m.upstream_errors} ({pct(m.upstream_errors, m.calls)})</td>
              <td className="num">{m.relay_errors} ({pct(m.relay_errors, m.calls)})</td>
              <td className="num">{m.avg_ms.toFixed(0)}</td>
              <td className="num">{m.p95_ms.toFixed(0)}</td>
            </tr>
          ))}
          {!metrics.length && !data.loading && <tr><td colSpan={6}><em>No calls in this window.</em></td></tr>}
        </tbody>
      </table>
    </section>
  )
}
