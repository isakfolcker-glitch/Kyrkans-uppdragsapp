'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { PastoratData } from '@/lib/appData'
import ConfirmModal from '@/components/modals/ConfirmModal'

function AddPastoratModal() {
  const { people, churches, closeModal, addPastorat, updatePerson, nextPastoratId, showModal } = useApp()
  const [name, setName] = useState('')
  const [adminId, setAdminId] = useState('')
  const [selChurches, setSelChurches] = useState<number[]>([])
  const employees = people.filter(p => p.isEmployee)
  const toggleChurch = (i: number) => setSelChurches(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  const save = () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    const adminPers = people.find(p => p.id === parseInt(adminId))
    const newP: PastoratData = { id: nextPastoratId(), name: name.trim(), admin: adminPers?.name || 'Ej tilldelad', adminEmail: adminPers?.mail || '', churches: selChurches }
    addPastorat(newP)
    if (adminPers) updatePerson({ ...adminPers, adminLevel: 'pastorat', role: 'padmin', isEmployee: true })
    closeModal()
  }
  return (
    <>
      <div className="modal-title">🌐 Nytt pastorat</div>
      <div className="form-field"><label>Namn på pastoratet</label><input placeholder="ex. Alvesta pastorat" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field">
        <label>Pastoratsadmin</label>
        <select value={adminId} onChange={e => setAdminId(e.target.value)}>
          <option value="">Välj person</option>
          {employees.map(p => <option key={p.id} value={p.id}>{p.name} – {p.mail}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Välj kyrkor</label>
        <div style={{ background: '#F1EFE8', borderRadius: 8, padding: 10 }}>
          {churches.map((c, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={selChurches.includes(i)} onChange={() => toggleChurch(i)} style={{ accentColor: '#534AB7' }} />
              <span style={{ fontSize: 13 }}>{c.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>✓ Skapa pastorat</button>
      </div>
    </>
  )
}

function EditPastoratModal({ id }: { id: number }) {
  const { pastorat, closeModal, updatePastorat } = useApp()
  const p = pastorat.find(x => x.id === id)
  if (!p) return null
  const [name, setName] = useState(p.name)
  const save = () => { updatePastorat({ ...p, name }); closeModal() }
  return (
    <>
      <div className="modal-title">✏️ Redigera – {p.name}</div>
      <div className="form-field"><label>Namn</label><input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>✓ Spara</button>
      </div>
    </>
  )
}

export default function PastoratPage() {
  const { pastorat, churches, showModal, deletePastorat } = useApp()
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 className="page-title">Pastorat</h1><p className="page-sub">Alla pastorat i systemet</p></div>
        <button className="btn btn-primary" onClick={() => showModal(<AddPastoratModal />)}>+ Nytt pastorat</button>
      </div>
      <div className="alert alert-amber">ℹ Prototyp – pastorat sparas bara i minnet.</div>
      {pastorat.map(p => {
        const churchNames = p.churches.map(i => churches[i]?.name).filter(Boolean)
        return (
          <div key={p.id} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#2C2C2A' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>Pastoratsadmin: {p.admin} · {p.adminEmail}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPastoratModal id={p.id} />)}>✏️ Redigera</button>
                <button className="btn btn-danger btn-sm" onClick={() => showModal(
                  <ConfirmModal title={`Ta bort ${p.name}?`} sub="Pastoratsadmins och kopplingar tas bort. Det går inte att ångra." confirmLabel="Ta bort" onConfirm={() => deletePastorat(p.id)} />
                )}>🗑</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#888780' }}>⛪ {p.churches.length} kyrkor: {churchNames.join(', ')}</div>
          </div>
        )
      })}
    </div>
  )
}
