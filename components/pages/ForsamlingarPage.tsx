'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'
import ConfirmModal from '@/components/modals/ConfirmModal'

interface Kyrka { id: number; name: string; address?: string; forsamling_id: number }

// ── Modal: Lägg till/redigera församling ──────────────
function ForsamlingModal({ idx, forsamlingId }: { idx?: number; forsamlingId?: number }) {
  const { churches, closeModal, addChurch, updateChurch } = useApp()
  const existing = idx !== undefined ? churches[idx] : null
  const [name, setName] = useState(existing?.name || '')
  const [admin, setAdmin] = useState(existing?.admin || '')
  const [tel, setTel] = useState(existing?.tel || '')
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    setLoading(true)
    if (existing && forsamlingId !== undefined) {
      await fetch(`/api/churches/${forsamlingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, admin, tel }) })
      updateChurch(idx!, { name, admin, tel })
    } else {
      const res = await fetch('/api/churches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, admin, tel }) })
      const data = await res.json()
      if (res.ok) addChurch({ id: data.id, name: data.name, admin: data.admin_name || '', tel: data.tel || '' })
    }
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">{existing ? 'Redigera församling' : 'Ny församling'}</h2>
      <div className="form-field"><label htmlFor="forsamlingar-f1">Församlingens namn</label><input id="forsamlingar-f1" placeholder="ex. Växjö domkyrkoförsamling" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="form-row">
        <div className="form-field"><label htmlFor="forsamlingar-f2">Ansvarig admin</label><input id="forsamlingar-f2" placeholder="Namn" value={admin} onChange={e => setAdmin(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="forsamlingar-f3">Telefon</label><input id="forsamlingar-f3" placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : 'Spara'}</button>
      </div>
    </>
  )
}

// ── Modal: Lägg till kyrka (byggnad) ─────────────────
function KyrkaModal({ forsamlingId, onSaved }: { forsamlingId: number; onSaved: (k: Kyrka) => void }) {
  const { closeModal } = useApp()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    setLoading(true)
    const res = await fetch('/api/kyrkor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), address, forsamling_id: forsamlingId }),
    })
    const data = await res.json()
    if (res.ok) onSaved(data)
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">Lägg till kyrka</h2>
      <div className="alert alert-blue">En kyrka är en fysisk byggnad inom en församling.</div>
      <div className="form-field"><label htmlFor="forsamlingar-f4">Kyrkans namn</label><input id="forsamlingar-f4" placeholder="ex. Växjö domkyrka" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="form-field"><label htmlFor="forsamlingar-f5">Adress</label><input id="forsamlingar-f5" placeholder="ex. Stortorget 1, Växjö" value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : 'Lägg till'}</button>
      </div>
    </>
  )
}

// ── Huvudsida ─────────────────────────────────────────
export default function ForsamlingarPage() {
  const { churches, passes, people, showModal, deleteChurch } = useApp()
  const [kyrkorMap, setKyrkorMap] = useState<Record<number, Kyrka[]>>({})

  // Hämta kyrkor (byggnader) från Supabase
  useEffect(() => {
    fetch('/api/kyrkor')
      .then(r => r.json())
      .then((data: Kyrka[]) => {
        const map: Record<number, Kyrka[]> = {}
        data.forEach(k => {
          if (!map[k.forsamling_id]) map[k.forsamling_id] = []
          map[k.forsamling_id].push(k)
        })
        setKyrkorMap(map)
      })
      .catch(() => {})
  }, [])

  const addKyrka = (k: Kyrka) => {
    setKyrkorMap(prev => ({
      ...prev,
      [k.forsamling_id]: [...(prev[k.forsamling_id] || []), k],
    }))
  }

  const removeKyrka = async (kyrkaId: number, forsamlingId: number) => {
    await fetch(`/api/kyrkor/${kyrkaId}`, { method: 'DELETE' })
    setKyrkorMap(prev => ({
      ...prev,
      [forsamlingId]: prev[forsamlingId]?.filter(k => k.id !== kyrkaId) || [],
    }))
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 className="page-title">Församlingar</h1><p className="page-sub">Församlingar och deras kyrkor</p></div>
        <button className="btn btn-primary" onClick={() => showModal(<ForsamlingModal />)}><Icon name="Plus" size={18} />Ny församling</button>
      </div>

      {churches.length === 0 && (
        <div className="empty-state">
          Inga församlingar ännu. Klicka på Ny församling för att börja.
        </div>
      )}

      {churches.map((c, i) => {
        const forsamlingId = c.id!
        const passCount = passes.filter(p => p.church === forsamlingId && !p.cancelled && p.pubStatus === 'live').length
        const peopleCount = people.filter(p => p.church === forsamlingId && p.role === 'ideell').length
        const byggn = kyrkorMap[forsamlingId] || []

        return (
          <div key={forsamlingId} className="panel">
            {/* Församlingshuvud */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="BuildingChurch" size={24} style={{ color: '#7D0037' }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)' }}>Admin: {c.admin} · {c.tel}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<ForsamlingModal idx={i} forsamlingId={forsamlingId} />)}><Icon name="Pencil" size={18} />Redigera<span className="sr-only"> {c.name}</span></button>
                <button className="btn btn-danger btn-sm" onClick={() => showModal(
                  <ConfirmModal
                    title={`Ta bort ${c.name}?`}
                    sub={`${passCount} pass och ${peopleCount} ideella är kopplade. Det går inte att ångra.`}
                    confirmLabel="Ta bort"
                    onConfirm={async () => {
                      await fetch(`/api/churches/${forsamlingId}`, { method: 'DELETE' })
                      deleteChurch(i)
                    }}
                  />
                )}><Icon name="Trash" size={18} />Ta bort<span className="sr-only"> {c.name}</span></button>
              </div>
            </div>

            {/* Antal */}
            <div className="meta-row" style={{ marginBottom: 12 }}>
              <span><Icon name="Users" size={16} />{peopleCount} ideella</span>
              <span><Icon name="Calendar" size={16} />{passCount} aktiva pass</span>
              <span><Icon name="BuildingChurch" size={16} />{byggn.length} kyrk{byggn.length !== 1 ? 'or' : 'a'}</span>
            </div>

            {/* Kyrkor (byggnader) */}
            <div className="row-line" style={{ paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: byggn.length ? 8 : 0 }}>
                <h3 className="week-label" style={{ margin: 0 }}>Kyrkor</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<KyrkaModal forsamlingId={forsamlingId} onSaved={addKyrka} />)}><Icon name="Plus" size={18} />Lägg till kyrka</button>
              </div>
              {byggn.length === 0 ? (
                <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>Inga kyrkor tillagda ännu.</div>
              ) : (
                byggn.map(k => (
                  <div key={k.id} className="row-line" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>{k.name}</div>
                      {k.address && <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)' }}>{k.address}</div>}
                    </div>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => showModal(
                      <ConfirmModal title={`Ta bort ${k.name}?`} sub="Kyrkan tas bort permanent." confirmLabel="Ta bort" onConfirm={() => removeKyrka(k.id, forsamlingId)} />
                    )} aria-label={`Ta bort ${k.name}`}><Icon name="Trash" size={18} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
