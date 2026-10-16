import { useState, type FormEvent } from 'react'
import { api, type Route, type Upstream } from '../api'
import { ActiveBadge, CopyButton, Drawer, DrawerHeader, ErrorBox, PageHeader } from '../ui'
import { fmtDate, useAction, useLoad } from '../lib'

export default function Upstreams() {
  const data = useLoad(() => Promise.all([api<Upstream[]>('/admin/upstreams'), api<Route[]>('/admin/routes')]), [])
  const action = useAction()
  const [editing, setEditing] = useState<Upstream | 'new' | null>(null)
  const [upstreams, routes] = data.data ?? [[], []]
  const routesOf = (id: string) => routes.filter((r) => r.upstream_id === id)

  const toggle = async (u: Upstream) => {
    if (await action.run(() => api(`/admin/upstreams/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } })))
      void data.reload()
  }

  return (
    <section>
      <PageHeader title="Upstreams" sub="APIs the relay may forward to. Nothing else is reachable.">
        <button className="primary" onClick={() => setEditing('new')}>New upstream</button>
      </PageHeader>
      <ErrorBox error={data.error ?? action.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Base URL</th><th>Used by</th><th>Status</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {upstreams.map((u) => {
              const used = routesOf(u.id)
              return (
                <tr key={u.id}>
                  <td data-label="Name" className="strong">{u.name}</td>
                  <td data-label="Base URL">
                    <div className="row-tight">
                      <code className="truncate" title={u.base_url}>{u.base_url}</code>
                      <CopyButton text={u.base_url} label="Copy base URL" />
                    </div>
                  </td>
                  <td data-label="Used by" className="small">
                    {used.length ? used.map((r) => <div key={r.id} className="mono">{r.slug}</div>) : <span className="muted">No routes</span>}
                  </td>
                  <td data-label="Status"><ActiveBadge active={u.is_active} /></td>
                  <td data-label="Created" className="small muted nowrap">{fmtDate(u.created_at)}</td>
                  <td data-label="" className="actions">
                    <button onClick={() => setEditing(u)}>Edit</button>
                    <button className="ghost" onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              )
            })}
            {data.data && !upstreams.length && (
              <tr><td colSpan={6} className="empty">No upstreams yet. Add the API you want to route calls to.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <UpstreamEditor
          upstream={editing === 'new' ? null : editing}
          routeCount={editing === 'new' ? 0 : routesOf(editing.id).length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void data.reload()
          }}
        />
      )}
    </section>
  )
}

function UpstreamEditor({ upstream, routeCount, onClose, onSaved }: { upstream: Upstream | null; routeCount: number; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(upstream?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(upstream?.base_url ?? '')
  const action = useAction()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await action.run(() =>
      upstream
        ? api(`/admin/upstreams/${upstream.id}`, { method: 'PATCH', body: { base_url: baseUrl } })
        : api('/admin/upstreams', { method: 'POST', body: { name, base_url: baseUrl } }),
    )
    if (ok) onSaved()
  }

  return (
    <Drawer label={upstream ? `Edit upstream ${upstream.name}` : 'New upstream'} onClose={onClose}>
      <form className="drawer-form" onSubmit={submit}>
        <DrawerHeader eyebrow={upstream ? 'Edit upstream' : 'New upstream'} title={upstream?.name ?? 'New upstream'} onClose={onClose} />
        <div className="drawer-body">
          <fieldset>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!upstream} placeholder="e.g. shipsgo" pattern="[a-z0-9][a-z0-9_\-]*" title="Lowercase letters, digits, - and _" required />
            </label>
            <label>
              Base URL
              <input className="mono" type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.vendor.com/v2" required />
              <span className="hint">
                Every call through a route to this upstream goes to this URL plus the path the consumer asked for. Use https. No query string or credentials.
              </span>
            </label>
            {upstream && routeCount > 0 && (
              <p className="notice">Changing the URL affects {routeCount} route{routeCount > 1 ? 's' : ''} straight away. Past calls keep the URL they were sent to.</p>
            )}
          </fieldset>
          <ErrorBox error={action.error} />
        </div>
        <footer className="drawer-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={action.busy}>{action.busy ? 'Saving…' : upstream ? 'Save changes' : 'Create upstream'}</button>
        </footer>
      </form>
    </Drawer>
  )
}
