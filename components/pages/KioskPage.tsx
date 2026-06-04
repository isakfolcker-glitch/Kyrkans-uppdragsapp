'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'

function KioskBookModal({ passId, onSuccess }: { passId: number; onSuccess: () => void }) {
  const { passes, closeModal } = useApp()
  const [name, setName]   = useState('')
  const [mail, setMail]   = useState('')
  const [tel, setTel]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  const submit = async () => {
    if (!name.trim()) { setError('Ange ditt namn.'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass_id: passId,
        name: name.trim(),
        mail: mail.trim(),
        tel: tel.trim(),
        source: 'kiosk',
        no_account: true,
        ini: name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        av_color: '#FFEBE1',
        ac_color: '#7D0037',
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Något gick fel.'); setLoading(false); return }
    setLoading(false)
    onSuccess()
  }

  return (
    <>
      <div style={{ background: '#FFEBE1', borderRadius: 12, padding: 16, marginBottom: 20, borderLeft: '4px solid #7D0037' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#000', marginBottom: 6 }}>{p.title}</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 14, color: '#5F5E5A', flexWrap: 'wrap' }}>
          <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
        </div>
      </div>
      <div className="kiosk-fld">
        <label>Namn <span style={{ color: '#7D0037' }}>*</span></label>
        <input placeholder="Ditt för- och efternamn" value={name} onChange={e => setName(e.target.value)} autoFocus />
      </div>
      <div className="kiosk-fld">
        <label>E-post <span style={{ color: '#BC8E4C', fontWeight: 400 }}>(för bekräftelse)</span></label>
        <input type="email" placeholder="din@epost.se" value={mail} onChange={e => setMail(e.target.value)} />
      </div>
      <div className="kiosk-fld">
        <label>Telefon</label>
        <input placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} />
      </div>
      {error && (
        <div className="alert alert-red" style={{ marginBottom: 12 }}>⚠ {error}</div>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary btn-lg" onClick={submit} disabled={loading}>
          {loading ? 'Bokar...' : '✓ Anmäl mig'}
        </button>
      </div>
    </>
  )
}

export default function KioskPage() {
  const { passes, churches, showModal, closeModal, activeChurch } = useApp()

  const visible = passes.filter(p =>
    p.pubStatus === 'live' &&
    !p.cancelled &&
    p.filled < p.spots &&
    p.kioskVisible &&
    p.church === churches[activeChurch]?.id
  )

  const openModal = (passId: number) => {
    const doSuccess = () => {
      const p = passes.find(x => x.id === passId)
      showModal(
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ width: 64, height: 64, background: '#28A88E', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#000', marginBottom: 8 }}>Tack, du är uppskriven!</div>
          <div style={{ fontSize: 14, color: '#5F5E5A', marginBottom: 20, lineHeight: 1.6 }}>
            Du är nu anmäld till passet.{p && mail_hint(p)}
          </div>
          {p && (
            <div style={{ background: '#FFEBE1', borderRadius: 12, padding: 16, marginBottom: 20, textAlign: 'left', borderLeft: '4px solid #28A88E' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#000', marginBottom: 6 }}>{p.title}</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#5F5E5A', flexWrap: 'wrap' }}>
                <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
              </div>
            </div>
          )}
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={closeModal}
          >
            🏠 Tillbaka
          </button>
        </div>
      )
    }
    showModal(<KioskBookModal passId={passId} onSuccess={doSuccess} />)
  }

  return (
    <div className="kiosk-wrap">
      <div className="kiosk-header">
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#7D0037', color: '#fff', borderRadius: 20,
          padding: '6px 14px', fontSize: 12, fontWeight: 700,
          marginBottom: 16, letterSpacing: '0.05em',
        }}>
          ✝ ANMÄLNINGSSTATION
        </div>
        <h1>Skriv upp dig som volontär</h1>
        <p>Välj ett pass nedan och fyll i dina uppgifter.<br />Du behöver inte ha konto sedan tidigare.</p>
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#fff', borderRadius: 20, border: '1px solid rgba(125,0,55,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#000', marginBottom: 8 }}>Inga lediga pass just nu</div>
          <div style={{ fontSize: 14, color: '#5F5E5A', lineHeight: 1.6 }}>Det finns inga pass att anmäla sig till för tillfället.<br />Kontakta en anställd för mer information.</div>
        </div>
      ) : (
        visible.map(p => {
          const left = p.spots - p.filled
          return (
            <div key={p.id} className="kiosk-pass-card" onClick={() => openModal(p.id)}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ background: '#FFEBE1', borderRadius: 12, padding: '10px 14px', textAlign: 'center', minWidth: 56, flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#7D0037', lineHeight: 1 }}>
                    {p.date ? new Date(p.date).getDate() : '–'}
                  </div>
                  <div style={{ fontSize: 11, color: '#BC8E4C', fontWeight: 700, textTransform: 'uppercase' }}>
                    {p.date ? new Date(p.date).toLocaleDateString('sv', { month: 'short' }) : ''}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="kiosk-pass-title">{p.title}</div>
                  <div style={{ display: 'flex', gap: 14, fontSize: 14, color: '#5F5E5A', flexWrap: 'wrap' }}>
                    <span>🕐 {p.time}</span><span>📍 {p.plats}</span>
                  </div>
                </div>
              </div>
              {p.desc && <div style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 14, lineHeight: 1.6 }}>{p.desc}</div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {Array.from({ length: Math.min(p.spots, 12) }, (_, i) => (
                    <div key={i} style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: i < p.filled ? '#7D0037' : '#FFEBE1',
                      border: i < p.filled ? 'none' : '1.5px solid #BC8E4C',
                    }} />
                  ))}
                  <span style={{ fontSize: 14, fontWeight: 700, color: left <= 2 ? '#FF785A' : '#28A88E', marginLeft: 8 }}>
                    {left} plats{left !== 1 ? 'er' : ''} kvar
                  </span>
                </div>
                <button className="btn btn-primary">Anmäl mig →</button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function mail_hint(p: any) {
  return p.vk ? ` Vakmästare: ${p.vk}${p.tel ? ', ' + p.tel : ''}.` : ''
}
