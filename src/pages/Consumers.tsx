import { useState, type FormEvent } from 'react'
import { api, type ApiKey, type Consumer, type Route } from '../api'
import { ActiveBadge, Badge, CopyButton, Drawer, DrawerHeader, ErrorBox, PageHeader } from '../ui'
import { fmtDate, useAction, useLoad } from '../lib'

export default function Consumers() {
  const data = useLoad(() => Promise.all([api<Consumer[]>('/admin/consumers'), api<Route[]>('/admin/routes')]), [])
  const action = useAction()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Consumer | null>(null)
  const [consumers, routes] = data.data ?? [[], []]

  const toggle = async (c: Consumer) => {
    if (await action.run(() => api(`/admin/consumers/${c.id}`, { method: 'PATCH', body: { is_active: !c.is_active } })))
      void data.reload()
  }

  return (
    <section>
      <PageHeader title="Consumers" sub="Apps and teams that send traffic through the relay. Each signs its calls with a key.">
        <button className="primary" onClick={() => setCreating(true)}>New consumer</button>
      </PageHeader>
      <ErrorBox error={data.error ?? action.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Routes</th><th>Status</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {consumers.map((c) => {
              const own = routes.filter((r) => r.consumer_id === c.id)
              return (
                <tr key={c.id}>
                  <td data-label="Name" className="strong">{c.name}</td>
                  <td data-label="Routes" className="small">
                    {own.length ? own.map((r) => <div key={r.id} className="mono">{r.slug}</div>) : <span className="muted">No routes</span>}
                  </td>
                  <td data-label="Status"><ActiveBadge active={c.is_active} /></td>
                  <td data-label="Created" className="small muted nowrap">{fmtDate(c.created_at)}</td>
                  <td data-label="" className="actions">
                    <button onClick={() => setSelected(c)}>Manage keys</button>
                    <button className="ghost" onClick={() => toggle(c)}>{c.is_active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              )
            })}
            {data.data && !consumers.length && (
              <tr><td colSpan={5} className="empty">No consumers yet. Create one, then give it a key.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {creating && (
        <NewConsumer
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false)
            void data.reload()
            setSelected(c) // a new consumer needs a key next
          }}
        />
      )}
      {selected && <Keys consumer={selected} key={selected.id} onClose={() => setSelected(null)} />}
    </section>
  )
}

function NewConsumer({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Consumer) => void }) {
  const [name, setName] = useState('')
  const action = useAction()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await action.run(async () => onCreated(await api<Consumer>('/admin/consumers', { method: 'POST', body: { name } })))
  }
  return (
    <Drawer label="New consumer" onClose={onClose}>
      <form className="drawer-form" onSubmit={submit}>
        <DrawerHeader eyebrow="New consumer" title="New consumer" onClose={onClose} />
        <div className="drawer-body">
          <fieldset>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. oms" pattern="[a-z0-9][a-z0-9_\-]*" title="Lowercase letters, digits, - and _" autoFocus required />
              <span className="hint">The app or team sending traffic. Next you'll create its first key.</span>
            </label>
          </fieldset>
          <ErrorBox error={action.error} />
        </div>
        <footer className="drawer-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create consumer'}</button>
        </footer>
      </form>
    </Drawer>
  )
}

function Keys({ consumer, onClose }: { consumer: Consumer; onClose: () => void }) {
  const keys = useLoad(() => api<ApiKey[]>(`/admin/consumers/${consumer.id}/keys`), [consumer.id])
  const action = useAction()
  const [label, setLabel] = useState('')
  const [expires, setExpires] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    await action.run(async () => {
      const created = await api<ApiKey & { key: string }>(`/admin/consumers/${consumer.id}/keys`, {
        method: 'POST',
        body: { label: label || null, expires_at: expires ? new Date(expires).toISOString() : null },
      })
      setFresh(created.key)
      setLabel('')
      setExpires('')
      void keys.reload()
    })
  }

  // the raw key is shown once; don't let it vanish by accident
  const close = () => {
    if (fresh && !window.confirm('Close without saving the new key? It will not be shown again.')) return
    onClose()
  }

  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Revoke key ${k.prefix}…? Calls using it will fail immediately.`)) return
    if (await action.run(() => api(`/admin/keys/${k.id}/revoke`, { method: 'POST' }))) void keys.reload()
  }

  return (
    <Drawer label={`Keys for ${consumer.name}`} onClose={close}>
      <DrawerHeader eyebrow="Keys" title={consumer.name} onClose={close} />
      <div className="drawer-body">
        <form className="stack" onSubmit={create}>
          <label>
            Label
            <input placeholder="e.g. production server" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            Expires (leave empty for no expiry)
            <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <div>
            <button className="primary" disabled={action.busy}>Create key</button>
          </div>
        </form>

        {fresh && (
          <div className="secret" role="status">
            <p>Copy this key now. Only its hash is stored, so it can't be shown again.</p>
            <code>{fresh}</code>
            <div className="row">
              <CopyButton text={fresh} label="Copy key" showLabel />
              <button onClick={() => setFresh(null)}>I saved it</button>
            </div>
          </div>
        )}
        <ErrorBox error={keys.error ?? action.error} />

        <h3>Existing keys</h3>
        <table className="kv-table">
          <thead>
            <tr><th>Key</th><th>Label</th><th>Status</th><th>Last used</th><th /></tr>
          </thead>
          <tbody>
            {keys.data?.map((k) => {
              const expired = !!k.expires_at && new Date(k.expires_at) < new Date()
              const ok = !k.revoked_at && !expired
              return (
                <tr key={k.id}>
                  <td data-label="Key"><code>{k.prefix}…</code></td>
                  <td data-label="Label">{k.label ?? <span className="muted">no label</span>}</td>
                  <td data-label="Status">
                    <Badge tone={ok ? 'ok' : 'idle'}>{k.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Active'}</Badge>
                    {ok && k.expires_at && <div className="hint">until {fmtDate(k.expires_at)}</div>}
                  </td>
                  <td data-label="Last used">{k.last_used_at ? fmtDate(k.last_used_at) : <span className="muted">Never used</span>}</td>
                  <td data-label="" className="actions">{ok && <button onClick={() => revoke(k)}>Revoke</button>}</td>
                </tr>
              )
            })}
            {keys.data && !keys.data.length && (
              <tr><td colSpan={5} className="empty">No keys yet. Create one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Drawer>
  )
}
