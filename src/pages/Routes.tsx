import { useState, type FormEvent } from 'react'
import { api, type Consumer, type LogBodies, type Route, type Upstream } from '../api'
import { ActiveBadge, CopyButton, Drawer, DrawerHeader, ErrorBox, PageHeader, TagInput } from '../ui'
import { useAction, useLoad } from '../lib'

const METHODS = ['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const MB = 1_048_576
const ALWAYS_HIDDEN = 'Authorization, Cookie, Set-Cookie, X-Api-Key, X-Relay-Key, and any header with token, secret, auth, api-key or password in its name'

type Rule = { method: string; path: string }
type Form = {
  slug: string
  consumer_id: string
  upstream_id: string
  rules: Rule[]
  timeout_s: number
  max_request_mb: number
  max_response_mb: number
  log_bodies: LogBodies
  redact: string[]
}

const EMPTY: Form = {
  slug: '',
  consumer_id: '',
  upstream_id: '',
  rules: [{ method: 'GET', path: '/' }],
  timeout_s: 10,
  max_request_mb: 1,
  max_response_mb: 10,
  log_bodies: 'errors',
  redact: [],
}

const round2 = (n: number) => Math.round(n * 100) / 100
const toRule = (r: string): Rule => {
  const [method, ...rest] = r.split(' ')
  return { method, path: rest.join(' ') }
}
const fromRoute = (r: Route): Form => ({
  slug: r.slug,
  consumer_id: r.consumer_id,
  upstream_id: r.upstream_id,
  rules: r.allowlist.map(toRule),
  timeout_s: r.timeout_ms / 1000,
  max_request_mb: round2(r.max_request_bytes / MB),
  max_response_mb: round2(r.max_response_bytes / MB),
  log_bodies: r.log_bodies,
  redact: r.redact_fields,
})

export default function Routes() {
  const data = useLoad(
    () => Promise.all([api<Route[]>('/admin/routes'), api<Consumer[]>('/admin/consumers'), api<Upstream[]>('/admin/upstreams')]),
    [],
  )
  const action = useAction()
  const [editing, setEditing] = useState<Route | 'new' | null>(null)
  const [routes, consumers, upstreams] = data.data ?? [[], [], []]
  const consumerName = (id: string) => consumers.find((c) => c.id === id)?.name ?? '…'
  const upstream = (id: string) => upstreams.find((u) => u.id === id)

  const toggle = async (r: Route) => {
    if (await action.run(() => api(`/admin/routes/${r.id}`, { method: 'PATCH', body: { is_active: !r.is_active } })))
      void data.reload()
  }

  return (
    <section>
      <PageHeader title="Routes" sub="Which consumer may call which upstream, and what it may call there.">
        <button className="primary" onClick={() => setEditing('new')} disabled={!consumers.length || !upstreams.length}>
          New route
        </button>
      </PageHeader>
      {data.data && (!consumers.length || !upstreams.length) && (
        <p className="notice">A route links a consumer to an upstream. Add at least one of each first.</p>
      )}
      <ErrorBox error={data.error ?? action.error} />

      <div className="table-wrap">
        <table className="routes">
          <thead>
            <tr>
              <th>Route</th>
              <th>Upstream</th>
              <th>Allowed calls</th>
              <th>Limits</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const up = upstream(r.upstream_id)
              return (
                <tr key={r.id}>
                  <td data-label="Route">
                    <div className="mono strong">{r.slug}</div>
                    <div className="muted small">{consumerName(r.consumer_id)} → {up?.name ?? '…'}</div>
                  </td>
                  <td data-label="Upstream" className="mono muted small truncate" title={up?.base_url}>{up?.base_url}</td>
                  <td data-label="Allowed calls"><RuleChips rules={r.allowlist} /></td>
                  <td data-label="Limits" className="small nowrap">
                    {r.timeout_ms / 1000} s timeout
                    <div className="muted">bodies: {r.log_bodies === 'errors' ? 'on errors' : r.log_bodies}</div>
                  </td>
                  <td data-label="Status"><ActiveBadge active={r.is_active} /></td>
                  <td data-label="" className="actions">
                    <button onClick={() => setEditing(r)}>Edit</button>
                    <button className="ghost" onClick={() => toggle(r)}>{r.is_active ? 'Disable' : 'Enable'}</button>
                  </td>
                </tr>
              )
            })}
            {data.data && !routes.length && (
              <tr><td colSpan={6} className="empty">No routes yet. A route is what lets a consumer reach an upstream.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <RouteEditor
          route={editing === 'new' ? null : editing}
          consumers={consumers}
          upstreams={upstreams}
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

function RuleChips({ rules }: { rules: string[] }) {
  const [all, setAll] = useState(false)
  if (!rules.length) return <span className="muted small">Nothing allowed</span>
  const shown = all ? rules : rules.slice(0, 3)
  return (
    <div className="chips">
      {shown.map((r) => {
        const { method, path } = toRule(r)
        return (
          <span key={r} className="chip">
            <b>{method === '*' ? 'ANY' : method}</b>
            {path}
          </span>
        )
      })}
      {rules.length > 3 && (
        <button className="link" onClick={() => setAll(!all)}>{all ? 'Show less' : `+${rules.length - 3} more`}</button>
      )}
    </div>
  )
}

function RouteEditor({
  route,
  consumers,
  upstreams,
  onClose,
  onSaved,
}: {
  route: Route | null
  consumers: Consumer[]
  upstreams: Upstream[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Form>(route ? fromRoute(route) : EMPTY)
  const action = useAction()
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setRule = (i: number, patch: Partial<Rule>) =>
    set('rules', form.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const settings = {
      upstream_id: form.upstream_id,
      allowlist: form.rules.filter((r) => r.path.trim()).map((r) => `${r.method} ${r.path.trim()}`),
      timeout_ms: Math.round(form.timeout_s * 1000),
      max_request_bytes: Math.round(form.max_request_mb * MB),
      max_response_bytes: Math.round(form.max_response_mb * MB),
      log_bodies: form.log_bodies,
      redact_fields: form.redact,
    }
    const ok = await action.run(() =>
      route
        ? api(`/admin/routes/${route.id}`, { method: 'PATCH', body: settings })
        : api('/admin/routes', { method: 'POST', body: { ...settings, slug: form.slug, consumer_id: form.consumer_id } }),
    )
    if (ok) onSaved()
  }

  const slug = form.slug || '<slug>'
  return (
    <Drawer label={route ? `Edit route ${route.slug}` : 'New route'} onClose={onClose}>
      <form className="drawer-form" onSubmit={submit}>
        <DrawerHeader eyebrow={route ? 'Edit route' : 'New route'} title={<span className="mono">{route?.slug ?? 'New route'}</span>} onClose={onClose} />
        <div className="drawer-body">
          <fieldset>
            <legend>Who and where</legend>
            <label>
              Slug
              <input
                className="mono"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
                disabled={!!route}
                placeholder="e.g. oms-shipsgo"
                pattern="[a-z0-9][a-z0-9_\-]*"
                title="Lowercase letters, digits, - and _"
                required
              />
              <span className="hint">Part of the URL the consumer calls. Can't be changed later.</span>
            </label>
            <div className="two">
              <label>
                Consumer
                <select value={form.consumer_id} onChange={(e) => set('consumer_id', e.target.value)} disabled={!!route} required>
                  <option value="">Choose…</option>
                  {consumers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (disabled)'}</option>)}
                </select>
              </label>
              <label>
                Upstream
                <select value={form.upstream_id} onChange={(e) => set('upstream_id', e.target.value)} required>
                  <option value="">Choose…</option>
                  {upstreams.map((u) => <option key={u.id} value={u.id}>{u.name}{u.is_active ? '' : ' (disabled)'}</option>)}
                </select>
              </label>
            </div>
            {form.upstream_id && (
              <p className="hint mono">→ {upstreams.find((u) => u.id === form.upstream_id)?.base_url}</p>
            )}
          </fieldset>

          <fieldset>
            <legend>Allowed calls</legend>
            <p className="hint">
              Anything not listed is refused. In a path, <code>*</code> matches one segment and a final <code>**</code> matches everything below, at any depth.
            </p>
            <div className="rules">
              {form.rules.map((r, i) => (
                <div key={i} className="rule">
                  <select value={r.method} onChange={(e) => setRule(i, { method: e.target.value })} aria-label="Method">
                    {METHODS.map((m) => <option key={m} value={m}>{m === '*' ? 'ANY' : m}</option>)}
                  </select>
                  <input
                    className="mono"
                    value={r.path}
                    onChange={(e) => setRule(i, { path: e.target.value })}
                    placeholder="/api/v3/**"
                    aria-label="Path"
                  />
                  <button type="button" className="ghost icon" aria-label="Remove rule" onClick={() => set('rules', form.rules.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set('rules', [...form.rules, { method: '*', path: '' }])}>Add rule</button>
          </fieldset>

          <fieldset>
            <legend>Limits</legend>
            <div className="three">
              <label>
                Timeout
                <span className="unit"><input type="number" min={0.1} max={120} step={0.1} value={form.timeout_s} onChange={(e) => set('timeout_s', Number(e.target.value))} /><i>s</i></span>
              </label>
              <label>
                Max request
                <span className="unit"><input type="number" min={0} max={100} step={0.1} value={form.max_request_mb} onChange={(e) => set('max_request_mb', Number(e.target.value))} /><i>MB</i></span>
              </label>
              <label>
                Max response
                <span className="unit"><input type="number" min={0} max={100} step={0.1} value={form.max_response_mb} onChange={(e) => set('max_response_mb', Number(e.target.value))} /><i>MB</i></span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Recording</legend>
            <span className="field-label">Store request and response bodies</span>
            <div className="segmented" role="group" aria-label="Store bodies">
              {(['never', 'errors', 'always'] as const).map((v) => (
                <button key={v} type="button" className={form.log_bodies === v ? 'on' : ''} aria-pressed={form.log_bodies === v} onClick={() => set('log_bodies', v)}>
                  {v === 'errors' ? 'Only on errors' : v === 'never' ? 'Never' : 'Always'}
                </button>
              ))}
            </div>
            <label className="spaced">
              Hide these headers and body fields
              <TagInput values={form.redact} onChange={(v) => set('redact', v)} placeholder="e.g. password, card.number, X-Tenant-Id" />
              <span className="hint">
                Stored as <code>***</code>; the call itself is forwarded unchanged. A header matches by name. A body field matches by
                name anywhere (<code>password</code>) or by exact path (<code>card.number</code>).
              </span>
              <span className="hint">Always hidden on every route: {ALWAYS_HIDDEN}.</span>
            </label>
          </fieldset>

          {route && (
            <fieldset>
              <legend>How the consumer calls it</legend>
              <CallUrl label="Key in a header (preferred)" url={`/relay/${slug}/<path>`} note="with header X-Relay-Key: <key>" />
              <CallUrl label="Key in the URL (when only a base URL can be set)" url={`/relay-k/<key>/${slug}/<path>`} note="the key then shows up wherever the consumer logs its URLs" />
            </fieldset>
          )}

          <ErrorBox error={action.error} />
        </div>
        <footer className="drawer-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={action.busy}>{action.busy ? 'Saving…' : route ? 'Save changes' : 'Create route'}</button>
        </footer>
      </form>
    </Drawer>
  )
}

const CallUrl = ({ label, url, note }: { label: string; url: string; note: string }) => (
  <div className="call-url">
    <span className="small muted">{label}</span>
    <div className="row-tight">
      <code>{url}</code>
      <CopyButton text={url} label="Copy path" />
    </div>
    <span className="hint">{note}</span>
  </div>
)
