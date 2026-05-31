'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'

function NewGroupModal() {
  const { closeModal, addGroup } = useApp()
  const [name, setName] = useState('')
  const [color, setColor] = useState('tag-extra')
  const save = () => {
    if (!name.trim()) { alert('Ange gruppnamn'); return }
    addGroup({ id: 'custom_' + Date.now(), label: name.trim(), cls: color })
    closeModal()
  }
  return (
    <>
      <div className="modal-title">👥 Ny grupp</div>
      <div className="form-field"><label>Gruppnamn</label><input placeholder="ex. Körvärd, Barnvakt..." value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field">
        <label>Färg</label>
        <select value={color} onChange={e => setColor(e.target.value)}>
          <option value="tag-kv">Blå</option><option value="tag-bv">Grön</option><option value="tag-brand">Röd</option>
          <option value="tag-konsert">Orange</option><option value="tag-extra">Lila</option><option value="tag-vakt">Grå</option><option value="tag-kor">Rosa</option>
        </select>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>✓ Skapa</button>
      </div>
    </>
  )
}

export default function GrupperPage() {
  const { groups, people, passes, churches, isPAdmin, activeChurch, setChurch, showModal, currentChurchId } = useApp()
  const cid = currentChurchId()
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 className="page-title">Grupper</h1><p className="page-sub">{churches[cid]?.name}</p></div>
        <button className="btn btn-primary" onClick={() => showModal(<NewGroupModal />)}>+ Ny grupp</button>
      </div>
      {isPAdmin() && (
        <div className="church-bar">
          {churches.map((c, i) => <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>{c.name}</button>)}
        </div>
      )}
      {groups.map(g => {
        const members = people.filter(p => p.church === cid && p.groups.includes(g.id))
        const gPasses = passes.filter(p => p.church === cid && p.groups.includes(g.id))
        return (
          <div key={g.id} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className={`tag ${g.cls}`} style={{ fontSize: 12, padding: '4px 10px' }}>{g.label}</span>
            </div>
            <div style={{ fontSize: 12, color: '#888780', display: 'flex', gap: 12, marginBottom: 8 }}>
              <span>👥 {members.length} person{members.length !== 1 ? 'er' : ''}</span>
              <span>📅 {gPasses.length} pass</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {members.map(m => <span key={m.id} style={{ fontSize: 12, background: '#F1EFE8', borderRadius: 20, padding: '2px 9px', color: '#5F5E5A' }}>{m.name.split(' ')[0]}</span>)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
