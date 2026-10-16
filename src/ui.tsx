import type { ReactNode } from 'react'

export const ErrorBox = ({ error }: { error: string | null }) =>
  error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null

export const Badge = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={`badge ${ok ? 'ok' : 'bad'}`}>{children}</span>
)
