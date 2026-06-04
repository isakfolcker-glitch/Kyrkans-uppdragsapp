'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { createClient } from '@/lib/supabase/client'
import ConfirmModal from '@/components/modals/ConfirmModal'


const colorOptions = [
  { value: 'tag-kv',      label: 'Blå' },
  { value: 'tag-bv',      label: 'Grön' },
  { value: 'tag-brand',   label: 'Röd' },
  { value: 'tag-konsert', label: 'Orange' },
  { value: 'tag-extra',   label: 'Lila' },
  { value: 'tag-vakt',    label: 'Grå' },
  { value: 'tag-kor',     label: 'Rosa' },
]

function NewGroupModal({ defaultChurchId }: { defaultChurchId: number }) {
  const { closeModal, addGroup, churches } = useApp()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('tag-extra')
  const [churchId, setChurchId] = useState(defaultChurchId)
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (!label.trim()) { alert('Ange gruppnamn'); return }
    setLoading(true)
    const id = label.trim().toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/\s+/g, '_') + '_' + Date.now()
    const supabase = createClient()
    const { data, error } = await supabase
      .from('groups')
      .insert({ id, label: label.trim(), cls: color, church_id: churchId })
      .select().single()
    if (error) { alert('Kunde inte skapa gruppen: ' + error.message); setLoading(false); return }
    addGroup({ id: data.id, label: data.label, cls: data.cls, churchId })
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <div className="modal-title">👥 Ny grupp</div>
      <div className="form-field"><label>Gruppnamn</label><input placeholder="ex. Körvärd, Barnvakt..." value={label} onChange={e => setLabel(e.target.value)} autoFocus /></div>
      <div className="form-field">
        <label>Färg</label>
        <select value={color} onChange={e => setColor(e.target.value)}>
          {colorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Kyrka</label>
        <select value={churchId} onChange={e => setChurchId(parseInt(e.target.value))}>
          {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
  const { groups, people, passes, churches, isPAdmin, isSuperAdmin, activeChurch, setChurch, showModal, closeModal, currentChurchId, deleteGroup } = useApp()
  const cid = currentChurchId()

  const visibleGroups = groups.filter(g => g.churchId === cid)

  const handleDelete = async (groupId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('groups').delete().eq('id', groupId)
    if (error) {
      alert('Kunde inte ta bort gruppen: ' + error.message)
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
          <p className="page-sub">{churches[cid]?.name ?? 'Alla kyrkor'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showModal(<NewGroupModal defaultChurchId={cid} />)}>+ Ny grupp</button>
      </div>

      {(isPAdmin() || isSuperAdmin()) && churches.length > 0 && (
        <div className="church-bar">
          {churches.map((c, i) => (
            <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          Inga grupper för {churches[cid]?.name ?? 'denna kyrka'} ännu.<br />
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => showModal(<NewGroupModal defaultChurchId={cid} />)}>
            + Skapa första gruppen
          </button>
        </div>
      ) : (
        visibleGroups.map(g => {
          const members = people.filter(p => p.church === cid && p.groups.includes(g.id))
          const gPasses = passes.filter(p => p.church === cid && p.groups.includes(g.id))
          const isShared = g.churchId === null || g.churchId === undefined

          return (
            <div key={g.id} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tag ${g.cls}`} style={{ fontSize: 12, padding: '4px 10px' }}>{g.label}</span>
                  {isShared && <span style={{ fontSize: 10, color: '#888780', background: '#F1EFE8', borderRadius: 20, padding: '2px 7px' }}>Alla kyrkor</span>}
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => showModal(
                  <ConfirmModal
                    title={`Ta bort "${g.label}"?`}
                    sub={`${members.length} person${members.length !== 1 ? 'er' : ''} och ${gPasses.length} pass kopplade.`}
                    confirmLabel="Ta bort"
                    onConfirm={() => handleDelete(g.id)}
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
        })
      )}
    </div>
  )
}
