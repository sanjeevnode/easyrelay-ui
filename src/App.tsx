import { useEffect, useState, type FormEvent } from 'react'
import { api, hasAdminKey, setAdminKey, setUnauthorizedHandler } from './api'
import { ErrorBox } from './ui'
import { errorText } from './lib'
import Consumers from './pages/Consumers'
import Upstreams from './pages/Upstreams'
import Routes from './pages/Routes'
import Calls from './pages/Calls'
import Metrics from './pages/Metrics'

const TABS = { calls: Calls, metrics: Metrics, routes: Routes, consumers: Consumers, upstreams: Upstreams }
type Tab = keyof typeof TABS

export default function App() {
  const [signedIn, setSignedIn] = useState(hasAdminKey())
  const [tab, setTab] = useState<Tab>('calls')

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAdminKey(null)
      setSignedIn(false)
    })
  }, [])

  if (!signedIn) return <SignIn onDone={() => setSignedIn(true)} />

  const Page = TABS[tab]
  return (
    <div className="app">
      <header>
        <strong>EasyRelay</strong>
        <nav>
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <button
          className="link"
          onClick={() => {
            setAdminKey(null)
            setSignedIn(false)
          }}
        >
          Sign out
        </button>
      </header>
      <main>
        <Page />
      </main>
    </div>
  )
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setAdminKey(key.trim())
    try {
      await api('/admin/consumers') // cheapest call that proves the key works
      onDone()
    } catch (err) {
      setAdminKey(null)
      setError(errorText(err))
    }
  }

  return (
    <form className="signin card" onSubmit={submit}>
      <h1>EasyRelay</h1>
      <label>
        Admin key
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoFocus
          required
        />
      </label>
      <button type="submit">Sign in</button>
      <ErrorBox error={error} />
      <p className="hint">Kept in this tab only and cleared when the tab closes.</p>
    </form>
  )
}
