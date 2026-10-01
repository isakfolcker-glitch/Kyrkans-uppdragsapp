'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'
import { PastoratData } from '@/lib/appData'
import ConfirmModal from '@/components/modals/ConfirmModal'

function AddPastoratModal() {
  const { people, churches, closeModal, addPastorat, updatePerson, nextPastoratId, showModal } = useApp()
  const [name, setName] = useState('')
  const [adminId, setAdminId] = useState('')
  const [selChurches, setSelChurches] = useState<number[]>([])
  const employees = people.filter(p => p.isEmployee)
  const toggleChurch = (id: number) => setSelChurches(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const save = async () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    const adminPers = people.find(p => p.id === parseInt(adminId))
    const newP: PastoratData = { id: nextPastoratId(), name: name.trim(), admin: adminPers?.name || 'Ej tilldelad', adminEmail: adminPers?.mail || '', churches: selChurches }
    await addPastorat(newP)
    if (adminPers) updatePerson({ ...adminPers, adminLevel: 'pastorat', role: 'padmin', isEmployee: true })
    closeModal()
  }
  return (
    <>
      <h2 className="modal-title">Nytt pastorat</h2>
      <div className="form-field"><label htmlFor="pastoratpage-f1">Namn på pastoratet</label><input id="pastoratpage-f1" placeholder="ex. Alvesta pastorat" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field">
        <label htmlFor="pastoratpage-f2">Pastoratsadmin</label>
        <select id="pastoratpage-f2" value={adminId} onChange={e => setAdminId(e.target.value)}>
          <option value="">Välj person</option>
          {employees.map(p => <option key={p.id} value={p.id}>{p.name} – {p.mail}</option>)}
        </select>
      </div>
      <div className="form-field" role="group" aria-labelledby="pastorat-kyrkor">
        <div id="pastorat-kyrkor" style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Välj kyrkor</div>
        <div className="panel" style={{ padding: '4px 14px', marginBottom: 0 }}>
          {churches.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, margin: 0, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={selChurches.includes(c.id!)} onChange={() => toggleChurch(c.id!)} style={{ accentColor: '#7D0037', width: 20, height: 20, minHeight: 0 }} />
              <span style={{ fontSize: 15 }}>{c.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>Skapa pastorat</button>
      </div>
    </>
  )
}

function EditPastoratModal({ id }: { id: number }) {
  const { pastorat, closeModal, updatePastorat } = useApp()
  const p = pastorat.find(x => x.id === id)
  if (!p) return null
  const [name, setName] = useState(p.name)
  const save = async () => { await updatePastorat({ ...p, name }); closeModal() }
  return (
    <>
      <h2 className="modal-title">Redigera <span className="serif">{p.name}</span></h2>
      <div className="form-field"><label htmlFor="pastoratpage-f3">Namn</label><input id="pastoratpage-f3" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>Spara</button>
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
        <button className="btn btn-primary" onClick={() => showModal(<AddPastoratModal />)}><Icon name="Plus" size={18} />Nytt pastorat</button>
      </div>
      {pastorat.map(p => {
        const churchNames = p.churches.map(cid => churches.find(c => c.id === cid)?.name).filter(Boolean)
        return (
          <div key={p.id} className="panel">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>{p.name}</div>
                <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)', marginTop: 2 }}>Pastoratsadmin: {p.admin} · {p.adminEmail}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPastoratModal id={p.id} />)}><Icon name="Pencil" size={18} />Redigera<span className="sr-only"> {p.name}</span></button>
                <button className="btn btn-danger btn-sm" onClick={() => showModal(
                  <ConfirmModal title={`Ta bort ${p.name}?`} sub="Pastoratsadmins och kopplingar tas bort. Det går inte att ångra." confirmLabel="Ta bort" onConfirm={() => deletePastorat(p.id)} />
                )}><Icon name="Trash" size={18} />Ta bort<span className="sr-only"> {p.name}</span></button>
              </div>
            </div>
            <div className="meta-row"><span><Icon name="BuildingChurch" size={16} />{p.churches.length} kyrkor: {churchNames.join(', ')}</span></div>
          </div>
        )
      })}
    </div>
  )
}
