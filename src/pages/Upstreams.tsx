import { useState, type FormEvent } from 'react'
import { api, type Upstream } from '../api'
import { ActiveBadge, ErrorBox, PageHeader } from '../ui'
import { fmtDate, useAction, useLoad } from '../lib'

export default function Upstreams() {
  const list = useLoad(() => api<Upstream[]>('/admin/upstreams'), [])
  const action = useAction()
  const [form, setForm] = useState({ name: '', base_url: '' })

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (await action.run(() => api('/admin/upstreams', { method: 'POST', body: form }))) {
      setForm({ name: '', base_url: '' })
      void list.reload()
    }
  }

  const toggle = async (u: Upstream) => {
    if (await action.run(() => api(`/admin/upstreams/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } })))
      void list.reload()
  }

  return (
    <section>
      <PageHeader title="Upstreams" sub="APIs the relay may forward to. Nothing else is reachable." />
      <form className="row" onSubmit={create}>
        <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input
          className="grow"
          type="url"
          placeholder="https://api.vendor.com/v1"
          value={form.base_url}
          onChange={(e) => setForm({ ...form, base_url: e.target.value })}
          required
        />
        <button disabled={action.busy}>Add upstream</button>
      </form>
      <ErrorBox error={list.error ?? action.error} />
      <table>
        <thead>
          <tr><th>Name</th><th>Base URL</th><th>Status</th><th>Created</th><th /></tr>
        </thead>
        <tbody>
          {list.data?.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td><code>{u.base_url}</code></td>
              <td><ActiveBadge active={u.is_active} /></td>
              <td>{fmtDate(u.created_at)}</td>
              <td className="actions">
                <button onClick={() => toggle(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
