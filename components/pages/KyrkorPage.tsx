'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'
import ConfirmModal from '@/components/modals/ConfirmModal'

function AddChurchModal() {
  const { closeModal, addChurch } = useApp()
  const [name, setName] = useState('')
  const [admin, setAdmin] = useState('')
  const [tel, setTel] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    setLoading(true)
    const res = await fetch('/api/churches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), admin, tel, address }),
    })
    const data = await res.json()
    if (res.ok) {
      addChurch({ name: data.name, admin: data.admin_name || '', tel: data.tel || '', address: data.address })
    }
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">Ny kyrka eller församling</h2>
      <div className="form-field"><label htmlFor="kyrkorpage-f1">Namn</label><input id="kyrkorpage-f1" placeholder="ex. Araby kyrka" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label htmlFor="kyrkorpage-f2">Ansvarig admin</label><input id="kyrkorpage-f2" placeholder="Namn" value={admin} onChange={e => setAdmin(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="kyrkorpage-f3">Telefon</label><input id="kyrkorpage-f3" placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
      </div>
      <div className="form-field"><label htmlFor="kyrkorpage-f4">Adress</label><input id="kyrkorpage-f4" placeholder="Gatuadress" value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : 'Lägg till kyrka'}</button>
      </div>
    </>
  )
}

function EditChurchModal({ idx, churchId }: { idx: number; churchId: number }) {
  const { churches, closeModal, updateChurch } = useApp()
  const c = churches[idx]
  const [name, setName] = useState(c.name)
  const [admin, setAdmin] = useState(c.admin)
  const [tel, setTel] = useState(c.tel)
  const [address, setAddress] = useState(c.address || '')
  const [loading, setLoading] = useState(false)

  const save = async () => {
    setLoading(true)
    await fetch(`/api/churches/${churchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, admin, tel, address }),
    })
    updateChurch(idx, { name, admin, tel, address })
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">Redigera kyrka</h2>
      <div className="form-field"><label htmlFor="kyrkorpage-f5">Namn</label><input id="kyrkorpage-f5" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label htmlFor="kyrkorpage-f6">Ansvarig admin</label><input id="kyrkorpage-f6" value={admin} onChange={e => setAdmin(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="kyrkorpage-f7">Telefon</label><input id="kyrkorpage-f7" value={tel} onChange={e => setTel(e.target.value)} /></div>
      </div>
      <div className="form-field"><label htmlFor="kyrkorpage-f8">Adress</label><input id="kyrkorpage-f8" value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : 'Spara'}</button>
      </div>
    </>
  )
}

export default function KyrkorPage() {
  const { churches, passes, people, showModal, deleteChurch } = useApp()
  // Spara Supabase-ID:n för varje kyrka (index → id)
  // Vi hämtar ID från appStore via fetchAppData som sätter dem i ordning från Supabase

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 className="page-title">Kyrkor</h1><p className="page-sub">Församlingar i pastoratet</p></div>
        <button className="btn btn-primary" onClick={() => showModal(<AddChurchModal />)}><Icon name="Plus" size={18} />Ny kyrka</button>
      </div>

      {churches.length === 0 && (
        <div className="empty-state">
          Inga kyrkor ännu. Klicka på Ny kyrka för att lägga till.
        </div>
      )}

      {churches.map((c, i) => {
        const cid = c.id!
        const passCount = passes.filter(p => p.church === cid && !p.cancelled && p.pubStatus === 'live').length
        const peopleCount = people.filter(p => p.church === cid && p.role === 'ideell').length
        return (
          <div key={cid} className="panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="BuildingChurch" size={24} style={{ color: '#7D0037' }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{c.name}</div>
                  <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)' }}>Admin: {c.admin} · {c.tel}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditChurchModal idx={i} churchId={cid} />)}><Icon name="Pencil" size={18} />Redigera<span className="sr-only"> {c.name}</span></button>
                <button className="btn btn-danger btn-sm" onClick={() => showModal(
                  <ConfirmModal
                    title={`Ta bort ${c.name}?`}
                    sub={`${passes.filter(p => p.church === cid).length} pass och ${people.filter(p => p.church === cid).length} personer är kopplade. Det går inte att ångra.`}
                    confirmLabel="Ta bort"
                    onConfirm={async () => {
                      await fetch(`/api/churches/${cid}`, { method: 'DELETE' })
                      deleteChurch(i)
                    }}
                  />
                )}><Icon name="Trash" size={18} />Ta bort<span className="sr-only"> {c.name}</span></button>
              </div>
            </div>
            <div className="meta-row">
              <span><Icon name="Users" size={16} />{peopleCount} ideella</span>
              <span><Icon name="Calendar" size={16} />{passCount} aktiva pass</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
