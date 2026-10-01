import type { ReactNode } from 'react'

/**
 * Ram för sidor utanför appen (inloggning, nytt lösenord, demo m.fl.):
 * beige bakgrund, vinrött huvud med appnamnet och en ljus yta under.
 */
export default function AuthCard({ title, lead, children, wide = false }: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="auth-page">
      <main className={`auth-card${wide ? ' auth-card-wide' : ''}`}>
        <div className="auth-head">
          <span style={{ fontSize: 16, fontWeight: 500 }}>Kyrkouppdrag</span>
          <span className="serif" style={{ fontSize: 14 }}>Svenska kyrkan Växjö</span>
          <h1 className="auth-title">{title}</h1>
          {lead && <p className="auth-lead">{lead}</p>}
        </div>
        <div className="auth-body">{children}</div>
      </main>
    </div>
  )
}
