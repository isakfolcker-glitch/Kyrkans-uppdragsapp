'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/lib/appStore'
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
      <div className="modal-title">{existing ? '✏️ Redigera församling' : '⛪ Ny församling'}</div>
      <div className="form-field"><label>Församlingens namn</label><input placeholder="ex. Växjö domkyrkoförsamling" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="form-row">
        <div className="form-field"><label>Ansvarig admin</label><input placeholder="Namn" value={admin} onChange={e => setAdmin(e.target.value)} /></div>
        <div className="form-field"><label>Telefon</label><input placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '✓ Spara'}</button>
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
      <div className="modal-title">🏛 Lägg till kyrka</div>
      <div className="alert alert-blue">En kyrka är en fysisk byggnad inom en församling.</div>
      <div className="form-field"><label>Kyrkans namn</label><input placeholder="ex. Växjö domkyrka" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
      <div className="form-field"><label>Adress</label><input placeholder="ex. Stortorget 1, Växjö" value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '✓ Lägg till'}</button>
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
        <button className="btn btn-primary" onClick={() => showModal(<ForsamlingModal />)}>+ Ny församling</button>
      </div>

      {churches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          Inga församlingar ännu. Klicka "+ Ny församling" för att börja.
        </div>
      )}

      {churches.map((c, i) => {
        const forsamlingId = c.id!
        const passCount = passes.filter(p => p.church === forsamlingId && !p.cancelled && p.pubStatus === 'live').length
        const peopleCount = people.filter(p => p.church === forsamlingId && p.role === 'ideell').length
        const byggn = kyrkorMap[forsamlingId] || []

        return (
          <div key={forsamlingId} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '16px', marginBottom: 12 }}>
            {/* Församlingshuvud */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, background: '#EEEDFE', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#534AB7', fontSize: 20, flexShrink: 0 }}>⛪</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#2C2C2A' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#888780' }}>Admin: {c.admin} · {c.tel}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<ForsamlingModal idx={i} forsamlingId={forsamlingId} />)}>✏️</button>
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
                )}>🗑</button>
              </div>
            </div>

            {/* Statistik */}
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#888780', marginBottom: 12 }}>
              <span>👥 {peopleCount} ideella</span>
              <span>📅 {passCount} aktiva pass</span>
              <span>🏛 {byggn.length} kyrka{byggn.length !== 1 ? 'r' : ''}</span>
            </div>

            {/* Kyrkor (byggnader) */}
            <div style={{ background: '#F1EFE8', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: byggn.length ? 8 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Kyrkor</div>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<KyrkaModal forsamlingId={forsamlingId} onSaved={addKyrka} />)}>+ Lägg till kyrka</button>
              </div>
              {byggn.length === 0 ? (
                <div style={{ fontSize: 12, color: '#888780', fontStyle: 'italic' }}>Inga kyrkor tillagda ännu.</div>
              ) : (
                byggn.map(k => (
                  <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E5E3DC' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>🏛 {k.name}</div>
                      {k.address && <div style={{ fontSize: 11, color: '#888780' }}>{k.address}</div>}
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => showModal(
                      <ConfirmModal title={`Ta bort ${k.name}?`} sub="Kyrkan tas bort permanent." confirmLabel="Ta bort" onConfirm={() => removeKyrka(k.id, forsamlingId)} />
                    )}>🗑</button>
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
