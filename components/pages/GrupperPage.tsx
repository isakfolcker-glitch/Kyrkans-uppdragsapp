'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import ConfirmModal from '@/components/modals/ConfirmModal'

function NewGroupModal() {
  const { closeModal, addGroup, churches, isPAdmin, currentChurchId } = useApp()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('tag-extra')
  const [churchId, setChurchId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const colorOptions = [
    { value: 'tag-kv', label: 'Blå' },
    { value: 'tag-bv', label: 'Grön' },
    { value: 'tag-brand', label: 'Röd' },
    { value: 'tag-konsert', label: 'Orange' },
    { value: 'tag-extra', label: 'Lila' },
    { value: 'tag-vakt', label: 'Grå' },
    { value: 'tag-kor', label: 'Rosa' },
  ]

  const save = async () => {
    if (!label.trim()) { alert('Ange gruppnamn'); return }
    setLoading(true)
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), cls: color, church_id: churchId }),
    })
    const data = await res.json()
    if (res.ok) {
      addGroup({ id: data.id, label: data.label, cls: data.cls })
    }
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <div className="modal-title">👥 Ny grupp</div>
      <div className="form-field"><label>Gruppnamn</label><input placeholder="ex. Körvärd, Barnvakt..." value={label} onChange={e => setLabel(e.target.value)} /></div>
      <div className="form-field">
        <label>Färg</label>
        <select value={color} onChange={e => setColor(e.target.value)}>
          {colorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Kyrka (valfritt – tom = gäller alla)</label>
        <select value={churchId ?? ''} onChange={e => setChurchId(e.target.value ? parseInt(e.target.value) : null)}>
          <option value="">Alla kyrkor</option>
          {churches.map((c, i) => <option key={i} value={i + 1}>{c.name}</option>)}
        </select>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '✓ Skapa'}</button>
      </div>
    </>
  )
}

export default function GrupperPage() {
  const { groups, people, passes, churches, isPAdmin, activeChurch, setChurch, showModal, currentChurchId } = useApp()
  const cid = currentChurchId()

  const deleteGroup = async (groupId: string, onDone: () => void) => {
    await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
    onDone()
    window.location.reload()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 className="page-title">Grupper</h1><p className="page-sub">Uppdragsgrupper</p></div>
        <button className="btn btn-primary" onClick={() => showModal(<NewGroupModal />)}>+ Ny grupp</button>
      </div>

      {isPAdmin() && (
        <div className="church-bar">
          {churches.map((c, i) => <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>{c.name}</button>)}
        </div>
      )}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga grupper ännu.</div>
      )}

      {groups.map(g => {
        const members = people.filter(p => p.church === cid && p.groups.includes(g.id))
        const gPasses = passes.filter(p => p.church === cid && p.groups.includes(g.id))
        return (
          <div key={g.id} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className={`tag ${g.cls}`} style={{ fontSize: 12, padding: '4px 10px' }}>{g.label}</span>
              <button className="btn btn-danger btn-sm" onClick={() => showModal(
                <ConfirmModal
                  title={`Ta bort gruppen "${g.label}"?`}
                  sub={`${members.length} person${members.length !== 1 ? 'er' : ''} och ${gPasses.length} pass är kopplade till gruppen.`}
                  confirmLabel="Ta bort"
                  onConfirm={() => deleteGroup(g.id, () => {})}
                />
              )}>🗑 Ta bort</button>
            </div>
            <div style={{ fontSize: 12, color: '#888780', display: 'flex', gap: 12, marginBottom: members.length ? 8 : 0 }}>
              <span>👥 {members.length} person{members.length !== 1 ? 'er' : ''}</span>
              <span>📅 {gPasses.length} pass</span>
            </div>
            {members.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {members.map(m => (
                  <span key={m.id} style={{ fontSize: 12, background: '#F1EFE8', borderRadius: 20, padding: '2px 9px', color: '#5F5E5A' }}>
                    {m.name.split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
