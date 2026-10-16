import { useState, type FormEvent } from 'react'
import { api, type ApiKey, type Consumer } from '../api'
import { Badge, ErrorBox } from '../ui'
import { fmtDate, useAction, useLoad } from '../lib'

export default function Consumers() {
  const list = useLoad(() => api<Consumer[]>('/admin/consumers'), [])
  const action = useAction()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Consumer | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (await action.run(() => api('/admin/consumers', { method: 'POST', body: { name } }))) {
      setName('')
      void list.reload()
    }
  }

  const toggle = async (c: Consumer) => {
    if (await action.run(() => api(`/admin/consumers/${c.id}`, { method: 'PATCH', body: { is_active: !c.is_active } })))
      void list.reload()
  }

  return (
    <section>
      <h2>Consumers</h2>
      <form className="row" onSubmit={create}>
        <input placeholder="name (a-z, 0-9, - _)" value={name} onChange={(e) => setName(e.target.value)} required />
        <button disabled={action.busy}>Add consumer</button>
      </form>
      <ErrorBox error={list.error ?? action.error} />
      <table>
        <thead>
          <tr><th>Name</th><th>Status</th><th>Created</th><th /></tr>
        </thead>
        <tbody>
          {list.data?.map((c) => (
            <tr key={c.id} className={selected?.id === c.id ? 'selected' : ''}>
              <td>{c.name}</td>
              <td><Badge ok={c.is_active}>{c.is_active ? 'active' : 'disabled'}</Badge></td>
              <td>{fmtDate(c.created_at)}</td>
              <td className="actions">
                <button onClick={() => setSelected(c)}>Keys</button>
                <button onClick={() => toggle(c)}>{c.is_active ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && <Keys consumer={selected} key={selected.id} />}
    </section>
  )
}

function Keys({ consumer }: { consumer: Consumer }) {
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

  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Revoke key ${k.prefix}…? Calls using it will fail immediately.`)) return
    if (await action.run(() => api(`/admin/keys/${k.id}/revoke`, { method: 'POST' }))) void keys.reload()
  }

  return (
    <div className="card">
      <h3>Keys for {consumer.name}</h3>
      <form className="row" onSubmit={create}>
        <input placeholder="label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="inline">
          expires
          <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <button disabled={action.busy}>Create key</button>
      </form>
      {fresh && (
        <div className="secret" role="status">
          <p>Copy this key now. It is not stored and will not be shown again.</p>
          <code>{fresh}</code>
          <div className="row">
            <button onClick={() => void navigator.clipboard.writeText(fresh)}>Copy</button>
            <button onClick={() => setFresh(null)}>I saved it</button>
          </div>
        </div>
      )}
      <ErrorBox error={keys.error ?? action.error} />
      <table>
        <thead>
          <tr><th>Key</th><th>Label</th><th>Status</th><th>Expires</th><th>Last used</th><th /></tr>
        </thead>
        <tbody>
          {keys.data?.map((k) => {
            const expired = !!k.expires_at && new Date(k.expires_at) < new Date()
            const ok = !k.revoked_at && !expired
            return (
              <tr key={k.id}>
                <td><code>{k.prefix}…</code></td>
                <td>{k.label ?? '—'}</td>
                <td><Badge ok={ok}>{k.revoked_at ? 'revoked' : expired ? 'expired' : 'active'}</Badge></td>
                <td>{fmtDate(k.expires_at)}</td>
                <td>{fmtDate(k.last_used_at)}</td>
                <td className="actions">{ok && <button onClick={() => revoke(k)}>Revoke</button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
