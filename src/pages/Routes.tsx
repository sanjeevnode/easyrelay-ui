import { useState, type FormEvent } from 'react'
import { api, type Consumer, type LogBodies, type Route, type Upstream } from '../api'
import { ActiveBadge, ErrorBox, PageHeader } from '../ui'
import { useAction, useLoad } from '../lib'

type Form = {
  slug: string
  consumer_id: string
  upstream_id: string
  allowlist: string
  timeout_ms: number
  max_request_bytes: number
  max_response_bytes: number
  log_bodies: LogBodies
  redact_fields: string
}

const EMPTY: Form = {
  slug: '',
  consumer_id: '',
  upstream_id: '',
  allowlist: '',
  timeout_ms: 10000,
  max_request_bytes: 1048576,
  max_response_bytes: 10485760,
  log_bodies: 'errors',
  redact_fields: '',
}

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

export default function Routes() {
  const data = useLoad(
    () =>
      Promise.all([
        api<Route[]>('/admin/routes'),
        api<Consumer[]>('/admin/consumers'),
        api<Upstream[]>('/admin/upstreams'),
      ]),
    [],
  )
  const action = useAction()
  const [form, setForm] = useState<Form>(EMPTY)
  const [editing, setEditing] = useState<Route | null>(null)
  const [routes, consumers, upstreams] = data.data ?? [[], [], []]
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? id

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v })

  const startEdit = (r: Route) => {
    setEditing(r)
    setForm({ ...r, allowlist: r.allowlist.join('\n'), redact_fields: r.redact_fields.join('\n') })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const settings = {
      upstream_id: form.upstream_id,
      allowlist: lines(form.allowlist),
      timeout_ms: Number(form.timeout_ms),
      max_request_bytes: Number(form.max_request_bytes),
      max_response_bytes: Number(form.max_response_bytes),
      log_bodies: form.log_bodies,
      redact_fields: lines(form.redact_fields),
    }
    const ok = await action.run(() =>
      editing
        ? api(`/admin/routes/${editing.id}`, { method: 'PATCH', body: settings })
        : api('/admin/routes', {
            method: 'POST',
            body: { ...settings, slug: form.slug, consumer_id: form.consumer_id },
          }),
    )
    if (ok) {
      setEditing(null)
      setForm(EMPTY)
      void data.reload()
    }
  }

  const toggle = async (r: Route) => {
    if (await action.run(() => api(`/admin/routes/${r.id}`, { method: 'PATCH', body: { is_active: !r.is_active } })))
      void data.reload()
  }

  return (
    <section>
      <PageHeader title="Routes" sub="Which consumer may call which upstream, and what it may call there." />
      <form className="card grid" onSubmit={submit}>
        <h3>{editing ? `Edit ${editing.slug}` : 'New route'}</h3>
        <label>
          Slug (used in /relay/&lt;slug&gt;/…)
          <input value={form.slug} onChange={(e) => set('slug', e.target.value)} disabled={!!editing} required />
        </label>
        <label>
          Consumer
          <select value={form.consumer_id} onChange={(e) => set('consumer_id', e.target.value)} disabled={!!editing} required>
            <option value="">—</option>
            {consumers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Upstream
          <select value={form.upstream_id} onChange={(e) => set('upstream_id', e.target.value)} required>
            <option value="">—</option>
            {upstreams.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.base_url})</option>)}
          </select>
        </label>
        <label className="wide">
          <span>
            Allowlist, one rule per line: <code>METHOD /path</code>. A <code>*</code> matches one path segment, or any method.
          </span>
          <textarea rows={4} value={form.allowlist} onChange={(e) => set('allowlist', e.target.value)} placeholder={'GET /v1/items/*\nPOST /v1/items'} />
        </label>
        <label>
          Timeout (ms)
          <input type="number" min={100} max={120000} value={form.timeout_ms} onChange={(e) => set('timeout_ms', Number(e.target.value))} />
        </label>
        <label>
          Max request bytes
          <input type="number" min={0} value={form.max_request_bytes} onChange={(e) => set('max_request_bytes', Number(e.target.value))} />
        </label>
        <label>
          Max response bytes
          <input type="number" min={0} value={form.max_response_bytes} onChange={(e) => set('max_response_bytes', Number(e.target.value))} />
        </label>
        <label>
          Store bodies
          <select value={form.log_bodies} onChange={(e) => set('log_bodies', e.target.value as LogBodies)}>
            <option value="never">never</option>
            <option value="errors">on errors</option>
            <option value="always">always</option>
          </select>
        </label>
        <label className="wide">
          <span>
            Fields to hide in stored bodies, one per line: <code>password</code> hides it anywhere, <code>card.number</code> only at that path.
          </span>
          <textarea rows={2} value={form.redact_fields} onChange={(e) => set('redact_fields', e.target.value)} />
        </label>
        <div className="row wide">
          <button className="primary" disabled={action.busy}>{editing ? 'Save changes' : 'Create route'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY) }}>Cancel</button>}
        </div>
      </form>
      <ErrorBox error={data.error ?? action.error} />
      <table>
        <thead>
          <tr><th>Slug</th><th>Consumer → Upstream</th><th>Allowlist</th><th>Bodies</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.id}>
              <td><code>{r.slug}</code></td>
              <td>{name(consumers, r.consumer_id)} → {name(upstreams, r.upstream_id)}</td>
              <td>{r.allowlist.length ? r.allowlist.map((a) => <div key={a}><code>{a}</code></div>) : <em>nothing allowed</em>}</td>
              <td>{r.log_bodies}</td>
              <td><ActiveBadge active={r.is_active} /></td>
              <td className="actions">
                <button onClick={() => startEdit(r)}>Edit</button>
                <button onClick={() => toggle(r)}>{r.is_active ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
