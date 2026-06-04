'use client'
import { useApp } from '@/lib/appStore'

export default function OversiktPage() {
  const { profile, passes, people, churches, notifications, goTo, setChurch, isAdmin, isPAdmin, isSuperAdmin } = useApp()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  // Kommande pass för inloggad användare
  const myUpcoming = passes
    .filter(p => !p.cancelled && p.pubStatus === 'live' && p.date >= today)
    .filter(p => p.responsibleUserIds?.includes(profile?.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)

  // Lediga pass (har platser kvar)
  const openPasses = passes
    .filter(p => !p.cancelled && p.pubStatus === 'live' && p.date >= today && p.filled < p.spots)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const unreadNotifs = notifications.filter(n => !n.read).length

  const displayName = profile?.name?.split(' ')[0] || 'där'

  return (
    <div>
      {/* Hälsning */}
      <div style={{
        background: 'linear-gradient(135deg, #7D0037 0%, #412B72 100%)',
        borderRadius: 20, padding: '28px 24px', marginBottom: 24, color: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dekorativ båge */}
        <div style={{
          position: 'absolute', right: -40, top: -40,
          width: 160, height: 160, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
        }} />
        <div style={{
          position: 'absolute', right: 20, bottom: -60,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }} />
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 4, fontWeight: 500 }}>
          {greet()} 👋
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          {displayName}
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
          {myUpcoming.length > 0
            ? `Du har ${myUpcoming.length} kommande uppdrag.`
            : 'Du har inga kommande uppdrag just nu.'}
        </p>
      </div>

      {/* Snabbstatistik */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => goTo('pass')}>
          <div className="stat-num">{openPasses.length}</div>
          <div className="stat-lbl">Lediga pass</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => goTo('mina-bokningar')}>
          <div className="stat-num">{passes.filter(p => p.bookings?.some((b: any) => b.personId === profile?.id)).length}</div>
          <div className="stat-lbl">Mina bokningar</div>
        </div>
        {unreadNotifs > 0 && (
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: '#FF785A' }} onClick={() => goTo('notiser')}>
            <div className="stat-num" style={{ color: '#FF785A' }}>{unreadNotifs}</div>
            <div className="stat-lbl">Olästa notiser</div>
          </div>
        )}
        {isAdmin() && (
          <div className="stat-card">
            <div className="stat-num">{people.filter(p => p.isEmployee === false).length}</div>
            <div className="stat-lbl">Ideella</div>
          </div>
        )}
      </div>

      {/* Nästa uppdrag */}
      {myUpcoming.length > 0 && (
        <>
          <div className="section-label">Nästa uppdrag</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {myUpcoming.map(p => (
              <div key={p.id} style={{
                background: '#fff', borderRadius: 14, padding: '14px 16px',
                border: '1px solid rgba(125,0,55,0.1)',
                borderLeft: '4px solid #7D0037',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  background: '#FFEBE1', borderRadius: 10, padding: '8px 12px',
                  textAlign: 'center', minWidth: 50, flexShrink: 0,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#7D0037', lineHeight: 1 }}>
                    {p.date ? new Date(p.date).getDate() : '–'}
                  </div>
                  <div style={{ fontSize: 10, color: '#BC8E4C', fontWeight: 600, textTransform: 'uppercase' }}>
                    {p.date ? new Date(p.date).toLocaleDateString('sv', { month: 'short' }) : ''}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 2 }}>{p.time} · {p.plats}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lediga pass */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-label" style={{ margin: 0 }}>Lediga pass</div>
        <button className="btn btn-secondary btn-sm" onClick={() => goTo('pass')}>Se alla →</button>
      </div>

      {openPasses.length === 0 ? (
        <EmptyState
          icon="📅"
          title="Inga lediga pass just nu"
          sub="Det finns inga pass att boka för tillfället. Kika tillbaka senare!"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {openPasses.map(p => (
            <div key={p.id} style={{
              background: '#fff', borderRadius: 14, padding: '14px 16px',
              border: '1px solid rgba(125,0,55,0.1)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                background: '#BEE1C8', borderRadius: 10, padding: '8px 12px',
                textAlign: 'center', minWidth: 50, flexShrink: 0,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#00554B', lineHeight: 1 }}>
                  {p.date ? new Date(p.date).getDate() : '–'}
                </div>
                <div style={{ fontSize: 10, color: '#28A88E', fontWeight: 600, textTransform: 'uppercase' }}>
                  {p.date ? new Date(p.date).toLocaleDateString('sv', { month: 'short' }) : ''}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 2 }}>{p.time} · {p.plats}</div>
              </div>
              <div style={{ fontSize: 12, color: '#28A88E', fontWeight: 700, flexShrink: 0 }}>
                {p.spots - p.filled} pl
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin-vy: alla kyrkor */}
      {(isPAdmin() || isSuperAdmin()) && churches.length > 0 && (
        <>
          <div className="section-label">Alla församlingar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {churches.map((c, i) => {
              const aktiva = passes.filter(x => x.church === c.id && !x.cancelled && x.pubStatus === 'live').length
              return (
                <div key={c.id ?? i} style={{
                  background: '#fff', border: '1px solid rgba(125,0,55,0.1)',
                  borderRadius: 14, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 40, height: 40, background: '#FFEBE1', borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                  }}>⛪</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: '#5F5E5A', marginTop: 2 }}>
                      {aktiva} aktiva pass · Admin: {c.admin}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setChurch(i); goTo('pass') }}>
                    Hantera
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '32px 24px',
      textAlign: 'center', border: '1px solid rgba(125,0,55,0.08)',
      marginBottom: 24,
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#000', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#5F5E5A', lineHeight: 1.6 }}>{sub}</div>
    </div>
  )
}

function greet() {
  const h = new Date().getHours()
  if (h < 10) return 'God morgon'
  if (h < 12) return 'God förmiddag'
  if (h < 17) return 'God eftermiddag'
  return 'God kväll'
}
