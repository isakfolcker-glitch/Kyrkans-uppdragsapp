'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import ConfirmModal from '@/components/modals/ConfirmModal'

const colorOptions = [
  { value: 'tag-kv', label: 'Blå' },
  { value: 'tag-bv', label: 'Grön' },
  { value: 'tag-brand', label: 'Röd' },
  { value: 'tag-konsert', label: 'Orange' },
  { value: 'tag-extra', label: 'Lila' },
  { value: 'tag-vakt', label: 'Grå' },
  { value: 'tag-kor', label: 'Rosa' },
]

function NewGroupModal({ churchId }: { churchId: number }) {
  const { closeModal, addGroup, churches } = useApp()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('tag-extra')
  const [loading, setLoading] = useState(false)
  const churchName = churches.find(church => church.id === churchId)?.name ?? 'vald församling'

  const save = async () => {
    if (!label.trim()) return
    setLoading(true)
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), cls: color, church_id: churchId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('Kunde inte skapa gruppen: ' + (data.error ?? res.status))
      setLoading(false)
      return
    }
    addGroup({ id: data.id, label: data.label, cls: data.cls, churchId })
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <div className="modal-title">👥 Ny grupp</div>
      <div className="alert alert-blue">Gruppen skapas i {churchName}.</div>
      <div className="form-field">
        <label>Gruppnamn</label>
        <input placeholder="ex. Körvärd, Barnvakt..." value={label} onChange={event => setLabel(event.target.value)} autoFocus />
      </div>
      <div className="form-field">
        <label>Färg</label>
        <select value={color} onChange={event => setColor(event.target.value)}>
          {colorOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
  const { groups, people, passes, churches, showModal, closeModal, currentChurchId, deleteGroup } = useApp()
  const churchId = currentChurchId()
  const visibleGroups = groups.filter(group => group.churchId === churchId || group.churchId === null)
  const churchName = churches.find(church => church.id === churchId)?.name ?? 'denna församling'

  const handleDelete = async (groupId: string) => {
    const res = await fetch(`/api/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('Kunde inte ta bort gruppen: ' + (data.error ?? res.status))
      closeModal()
      return
    }
    deleteGroup(groupId)
    closeModal()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Grupper</h1>
          <p className="page-sub">{churchName}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showModal(<NewGroupModal churchId={churchId} />)}>+ Ny grupp</button>
      </div>

      {visibleGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          Inga grupper för {churchName} ännu.<br />
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => showModal(<NewGroupModal churchId={churchId} />)}>
            + Skapa första gruppen
          </button>
        </div>
      ) : (
        visibleGroups.map(group => {
          const members = people.filter(person => person.church === churchId && person.groups.includes(group.id))
          const groupPasses = passes.filter(passItem => passItem.church === churchId && passItem.groups.includes(group.id))
          const isShared = group.churchId === null || group.churchId === undefined

          return (
            <div key={group.id} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tag ${group.cls}`} style={{ fontSize: 12, padding: '4px 10px' }}>{group.label}</span>
                  {isShared && <span style={{ fontSize: 10, color: '#888780', background: '#F1EFE8', borderRadius: 20, padding: '2px 7px' }}>Gemensam</span>}
                </div>
                {!isShared && (
                  <button className="btn btn-danger btn-sm" onClick={() => showModal(
                    <ConfirmModal
                      title={`Ta bort "${group.label}"?`}
                      sub={`${members.length} person${members.length !== 1 ? 'er' : ''} och ${groupPasses.length} pass är kopplade.`}
                      confirmLabel="Ta bort"
                      onConfirm={() => handleDelete(group.id)}
                    />
                  )}>🗑 Ta bort</button>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#888780', display: 'flex', gap: 12, marginBottom: members.length ? 8 : 0 }}>
                <span>👥 {members.length} person{members.length !== 1 ? 'er' : ''}</span>
                <span>📅 {groupPasses.length} pass</span>
              </div>
              {members.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {members.map(member => (
                    <span key={`${member.id}-${member.church}`} style={{ fontSize: 12, background: '#F1EFE8', borderRadius: 20, padding: '2px 9px', color: '#5F5E5A' }}>
                      {member.name.split(' ')[0]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
