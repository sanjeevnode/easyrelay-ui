import { useEffect, useRef, type ReactNode } from 'react'
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
