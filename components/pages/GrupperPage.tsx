'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import ConfirmModal from '@/components/modals/ConfirmModal'
import Icon from '@/components/ui/Icon'

// Värdena (tag-kv m.fl.) är de som sparas i databasen och ändras inte.
// Bara namnen som visas är nya, så att de stämmer med de varma färgerna.
const colorOptions = [
  { value: 'tag-kv', label: 'Vinröd' },
  { value: 'tag-bv', label: 'Sand' },
  { value: 'tag-brand', label: 'Rosa' },
  { value: 'tag-konsert', label: 'Guld' },
  { value: 'tag-extra', label: 'Vinröd kant' },
  { value: 'tag-vakt', label: 'Beige' },
  { value: 'tag-kor', label: 'Orange' },
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
      <h2 className="modal-title">Ny grupp</h2>
      <div className="alert alert-blue">Gruppen skapas i {churchName}.</div>
      <div className="form-field">
        <label htmlFor="ny-grupp-namn">Gruppnamn</label>
        <input id="ny-grupp-namn" placeholder="ex. Körvärd, Barnvakt..." value={label} onChange={event => setLabel(event.target.value)} autoFocus />
      </div>
      <div className="form-field">
        <label htmlFor="ny-grupp-farg">Färg</label>
        <select id="ny-grupp-farg" value={color} onChange={event => setColor(event.target.value)}>
          {colorOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <div style={{ marginTop: 10, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          Så här ser den ut: <span className={`tag ${color}`}>{label.trim() || 'Gruppnamn'}</span>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : 'Skapa'}</button>
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
        <button className="btn btn-primary" onClick={() => showModal(<NewGroupModal churchId={churchId} />)}><Icon name="Plus" size={18} />Ny grupp</button>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="empty-state">
          Inga grupper för {churchName} ännu.<br />
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => showModal(<NewGroupModal churchId={churchId} />)}>
            <Icon name="Plus" size={18} />Skapa första gruppen
          </button>
        </div>
      ) : (
        visibleGroups.map(group => {
          const members = people.filter(person => person.church === churchId && person.groups.includes(group.id))
          const groupPasses = passes.filter(passItem => passItem.church === churchId && passItem.groups.includes(group.id))
          const isShared = group.churchId === null || group.churchId === undefined

          return (
            <div key={group.id} className="panel" style={{ padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tag ${group.cls}`}>{group.label}</span>
                  {isShared && <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)', background: 'rgba(125,0,55,0.06)', borderRadius: 20, padding: '2px 7px' }}>Gemensam</span>}
                </div>
                {!isShared && (
                  <button className="btn btn-danger btn-sm" onClick={() => showModal(
                    <ConfirmModal
                      title={`Ta bort "${group.label}"?`}
                      sub={`${members.length} person${members.length !== 1 ? 'er' : ''} och ${groupPasses.length} pass är kopplade.`}
                      confirmLabel="Ta bort"
                      onConfirm={() => handleDelete(group.id)}
                    />
                  )}><Icon name="Trash" size={18} />Ta bort<span className="sr-only"> {group.label}</span></button>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)', display: 'flex', gap: 12, marginBottom: members.length ? 8 : 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="Users" size={16} />{members.length} person{members.length !== 1 ? 'er' : ''}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="Calendar" size={16} />{groupPasses.length} pass</span>
              </div>
              {members.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {members.map(member => (
                    <span key={`${member.id}-${member.church}`} style={{ fontSize: 13, background: 'rgba(125,0,55,0.06)', borderRadius: 20, padding: '2px 9px', color: 'rgba(0,0,0,0.72)' }}>
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
