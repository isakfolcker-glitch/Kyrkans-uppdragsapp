'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
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
      <div className="modal-header">
        <div className="modal-header-quarter" />
        <div className="modal-title">⛪ Ny kyrka / församling</div>
      </div>
      <div className="modal-body">
      <div className="form-field"><label>Namn</label><input placeholder="ex. Araby kyrka" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label>Ansvarig admin</label><input placeholder="Namn" value={admin} onChange={e => setAdmin(e.target.value)} /></div>
        <div className="form-field"><label>Telefon</label><input placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
      </div>
      <div className="form-field"><label>Adress</label><input placeholder="Gatuadress" value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '✓ Lägg till kyrka'}</button>
      </div>
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
      <div className="modal-header">
        <div className="modal-header-quarter" />
        <div className="modal-title">✏️ Redigera kyrka</div>
      </div>
      <div className="modal-body">
      <div className="form-field"><label>Namn</label><input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label>Ansvarig admin</label><input value={admin} onChange={e => setAdmin(e.target.value)} /></div>
        <div className="form-field"><label>Telefon</label><input value={tel} onChange={e => setTel(e.target.value)} /></div>
      </div>
      <div className="form-field"><label>Adress</label><input value={address} onChange={e => setAddress(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '✓ Spara'}</button>
      </div>
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
        <button className="btn btn-primary" onClick={() => showModal(<AddChurchModal />)}>+ Ny kyrka</button>
      </div>

      {churches.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          Inga kyrkor ännu. Klicka på "+ Ny kyrka" för att lägga till.
        </div>
      )}

      {churches.map((c, i) => {
        const cid = c.id!
        const passCount = passes.filter(p => p.church === cid && !p.cancelled && p.pubStatus === 'live').length
        const peopleCount = people.filter(p => p.church === cid && p.role === 'ideell').length
        return (
          <div key={cid} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, background: '#EEEDFE', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#534AB7', fontSize: 18, flexShrink: 0 }}>⛪</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2A' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#888780' }}>Admin: {c.admin} · {c.tel}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditChurchModal idx={i} churchId={cid} />)}>✏️ Redigera</button>
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
                )}>🗑</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#888780' }}>
              <span>👥 {peopleCount} ideella</span>
              <span>📅 {passCount} aktiva pass</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
