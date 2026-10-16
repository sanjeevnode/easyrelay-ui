import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Tone, Trace } from './lib'

export const ErrorBox = ({ error }: { error: string | null }) =>
  error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null

export const Badge = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={`badge tone-${tone}`}>{children}</span>
)

export const ActiveBadge = ({ active }: { active: boolean }) => (
  <Badge tone={active ? 'ok' : 'idle'}>{active ? 'Active' : 'Disabled'}</Badge>
)

export const PageHeader = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
    {children && <div className="page-actions">{children}</div>}
  </div>
)

/** consumer → relay → upstream, lit up to where the call got. */
export function HopTrace({ trace, labels }: { trace: Trace; labels?: [string, string, string] }) {
  const hops = (
    <span className="trace" title={labels ? undefined : trace.summary} aria-label={trace.summary} role="img">
      <i className="node tone-ok" />
      <i className="wire tone-ok" />
      <i className={`node relay tone-${trace.relay}`} />
      <i className={`wire ${trace.link === 'broken' ? 'broken tone-fault' : trace.link === 'none' ? 'tone-idle' : 'tone-ok'}`} />
      <i className={`node tone-${trace.upstream}`} />
    </span>
  )
  if (!labels) return hops
  return (
    <figure className="trace-lg">
      {hops}
      <figcaption>
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </figcaption>
      <p>{trace.summary}</p>
    </figure>
  )
}

export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  )
}

const CopyIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Icon button that copies text. showLabel: true shows `label`, a string shows that text instead. */
export function CopyButton({ text, label, showLabel }: { text: string; label: string; showLabel?: boolean | string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('failed') // clipboard needs a secure context (https or localhost)
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 1500)
  }

  const visible = showLabel === true ? label : showLabel || null
  const status = state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : null
  return (
    <button
      type="button"
      className={`copy ${visible ? 'with-label' : ''} ${state}`}
      onClick={copy}
      title={label}
      aria-label={status ?? label}
    >
      {state === 'done' ? <CheckIcon /> : <CopyIcon />}
      {(status ?? visible) && <span>{status ?? visible}</span>}
    </button>
  )
}

export function DrawerHeader({ eyebrow, title, onClose }: { eyebrow: string; title: ReactNode; onClose: () => void }) {
  return (
    <header className="drawer-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <button type="button" className="ghost" onClick={onClose} aria-label="Close">
        Close
      </button>
    </header>
  )
}

/** Free-text values as removable chips. Enter or comma adds; Backspace on empty removes the last. */
export function TagInput({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }
  return (
    <div className="tags">
      {values.map((v) => (
        <span key={v} className="tag">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
        }}
        onBlur={add}
      />
    </div>
  )
}
