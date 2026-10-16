import { useEffect, useState, type FormEvent } from 'react'
import { currentUser, setUnauthorizedHandler, signIn, signOut } from './api'
import { ErrorBox } from './ui'
import { errorText, useDevice } from './lib'
import Consumers from './pages/Consumers'
import Upstreams from './pages/Upstreams'
import Routes from './pages/Routes'
import Calls from './pages/Calls'
import Metrics from './pages/Metrics'

const SECTIONS = [
  { id: 'calls', label: 'Calls', page: Calls, group: 'Traffic' },
  { id: 'metrics', label: 'Metrics', page: Metrics, group: 'Traffic' },
  { id: 'routes', label: 'Routes', page: Routes, group: 'Setup' },
  { id: 'consumers', label: 'Consumers', page: Consumers, group: 'Setup' },
  { id: 'upstreams', label: 'Upstreams', page: Upstreams, group: 'Setup' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

export default function App() {
  const [user, setUser] = useState(currentUser())
  const [section, setSection] = useState<SectionId>('calls')
  const device = useDevice()

  useEffect(() => {
    document.documentElement.dataset.device = device
  }, [device])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
  }, [])

  if (!user) return <SignIn onDone={() => setUser(currentUser())} />

  const Page = SECTIONS.find((s) => s.id === section)!.page
  return (
    <div className="shell">
      <aside className="rail">
        <div className="wordmark">
          <span className="mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          EasyRelay
        </div>
        <nav>
          {(['Traffic', 'Setup'] as const).map((group) => (
            <div key={group} className="nav-group">
              <span className="nav-label">{group}</span>
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.id}
                  className={s.id === section ? 'nav-item current' : 'nav-item'}
                  aria-current={s.id === section ? 'page' : undefined}
                  onClick={() => setSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          <span className="who" title="Signed in as">
            {user}
          </span>
          <button className="ghost" onClick={() => void signOut().finally(() => setUser(null))}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        <Page />
      </main>
    </div>
  )
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(username.trim(), password)
      onDone()
    } catch (err) {
      setError(errorText(err))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="signin-page">
      <form className="signin" onSubmit={submit}>
        <div className="wordmark big">
          <span className="mark" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          EasyRelay
        </div>
        <p className="sub">See exactly what was sent and what came back.</p>
        <label>
          Username
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <ErrorBox error={error} />
        <p className="hint">Accounts are created by an operator on the server with <code>python -m app.cli create-admin</code>.</p>
      </form>
    </div>
  )
}
