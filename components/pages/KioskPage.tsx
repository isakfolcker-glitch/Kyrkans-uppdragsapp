'use client'
import { useId, useState } from 'react'
import { useApp } from '@/lib/appStore'
import type { PassData } from '@/lib/appData'
import Icon, { PassMeta } from '@/components/ui/Icon'

function KioskBookModal({ passId, onSuccess }: { passId: number; onSuccess: () => void }) {
  const { passes, closeModal } = useApp()
  const [name, setName]   = useState('')
  const [mail, setMail]   = useState('')
  const [tel, setTel]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const ids = useId()
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
      <h2 className="modal-title">Anmäl dig</h2>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: '#000', marginBottom: 8 }}>{p.title}</div>
        <PassMeta date={p.date} time={p.time} plats={p.plats} className="meta-row" />
      </div>
      <div className="kiosk-fld">
        <label htmlFor={`${ids}-namn`}>Namn <span className="req">(måste fyllas i)</span></label>
        <input id={`${ids}-namn`} autoComplete="name" required placeholder="Ditt för- och efternamn" value={name} onChange={e => setName(e.target.value)} autoFocus />
      </div>
      <div className="kiosk-fld">
        <label htmlFor={`${ids}-mail`}>E-post <span style={{ color: 'rgba(0,0,0,0.72)', fontWeight: 400 }}>(för bekräftelse)</span></label>
        <input id={`${ids}-mail`} type="email" autoComplete="email" placeholder="din@epost.se" value={mail} onChange={e => setMail(e.target.value)} />
      </div>
      <div className="kiosk-fld">
        <label htmlFor={`${ids}-tel`}>Telefon</label>
        <input id={`${ids}-tel`} type="tel" autoComplete="tel" placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} />
      </div>
      {error && (
        <div role="alert" className="alert alert-red" style={{ marginBottom: 12 }}><Icon name="Alert" size={18} />{error}</div>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary btn-lg" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary btn-lg" onClick={submit} disabled={loading}>
          {loading ? 'Anmäler...' : 'Anmäl mig'}
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
        <div role="status" style={{ textAlign: 'center', padding: '8px 0' }}>
          <Icon name="CircleCheck" size={56} style={{ color: '#7D0037', margin: '0 auto 12px', display: 'block' }} />
          <h2 style={{ fontSize: 26, fontWeight: 500, color: '#000', marginBottom: 8 }}>Tack, <span className="serif">du är anmäld</span></h2>
          <div style={{ fontSize: 16, color: 'rgba(0,0,0,0.72)', marginBottom: 20, lineHeight: 1.6 }}>
            Du är nu anmäld till passet.{p && mail_hint(p)}
          </div>
          {p && (
            <div className="panel" style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#000', marginBottom: 6 }}>{p.title}</div>
              <PassMeta date={p.date} time={p.time} plats={p.plats} className="meta-row" />
            </div>
          )}
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            onClick={closeModal}
          >
            <Icon name="ArrowLeft" />Tillbaka till passen
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
          background: '#FFC3AA', color: '#000', borderRadius: 20,
          padding: '6px 16px', fontSize: 15, fontWeight: 500,
          marginBottom: 16,
        }}>
          <Icon name="DeviceIpad" size={18} />Anmälningsstation
        </div>
        <h1>Skriv upp dig <span className="serif">som volontär</span></h1>
        <p>Välj ett pass nedan och fyll i dina uppgifter.<br />Du behöver inte ha konto sedan tidigare.</p>
      </div>

      {visible.length === 0 ? (
        <div className="panel empty-state">
          <div className="empty-state-title">Inga lediga pass just nu</div>
          <div>Det finns inga pass att anmäla sig till för tillfället.<br />Kontakta en anställd för mer information.</div>
        </div>
      ) : (
        visible.map(p => <KioskCard key={p.id} pass={p} onOpen={() => openModal(p.id)} />)
      )}
    </div>
  )
}

function KioskCard({ pass: p, onOpen }: { pass: PassData; onOpen: () => void }) {
  const left = p.spots - p.filled
  const [y, m, d] = p.date ? p.date.split('-').map(Number) : []
  const date = p.date ? new Date(y, m - 1, d) : null
  return (
    // Hela kortet går att trycka på. Knappen är det som nås med tangentbord och skärmläsare.
    <div className="kiosk-pass-card" onClick={onOpen} style={{ flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ background: '#FFEBE1', borderRadius: 14, padding: '10px 14px', textAlign: 'center', minWidth: 64, flexShrink: 0, lineHeight: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 500, color: '#7D0037' }}>{date ? date.getDate() : '–'}</div>
          <div className="serif" style={{ fontSize: 16, color: '#000', marginTop: 4 }}>
            {date ? date.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '') : ''}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="kiosk-pass-title">{p.title}</h2>
          <PassMeta time={p.time} plats={p.plats} className="meta-row" />
        </div>
      </div>
      {p.desc && <div style={{ fontSize: 15, color: 'rgba(0,0,0,0.72)', marginBottom: 14, lineHeight: 1.6 }}>{p.desc}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span aria-hidden="true" style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: Math.min(p.spots, 12) }, (_, i) => (
              <span key={i} className={`dot ${i < p.filled ? 'dot-on' : 'dot-off'}`} />
            ))}
          </span>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#7D0037', marginLeft: 8 }}>
            {left} plats{left !== 1 ? 'er' : ''} kvar
          </span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={e => { e.stopPropagation(); onOpen() }}
        >
          Anmäl mig<span className="sr-only"> till {p.title}</span>
        </button>
      </div>
    </div>
  )
}

function mail_hint(p: PassData) {
  return p.vk ? ` Vaktmästare: ${p.vk}${p.tel ? ', ' + p.tel : ''}.` : ''
}
