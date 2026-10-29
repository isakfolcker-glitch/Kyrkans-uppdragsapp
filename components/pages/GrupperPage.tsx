'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import ConfirmModal from '@/components/modals/ConfirmModal'
import Icon from '@/components/ui/Icon'
import { useChat } from '@/components/chat/ChatProvider'
import ChatPrivacyNote from '@/components/chat/ChatPrivacyNote'
import { formatUnread, withLeader } from '@/lib/chatClient'
import type { Group, PersonData } from '@/lib/appData'

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


/** Fliken Chatt i en grupp: öppnar samma gruppchatt som under Chatt i menyn. */
function GroupChatTab({ group }: { group: Group }) {
  const { chats, overviewStatus, openChat, enabled } = useChat()
  const { goTo } = useApp()
  const chat = chats.find(c => c.groupId === group.id)

  if (!enabled || overviewStatus === 'loading' || overviewStatus === 'idle') return <p style={{ fontSize: 14 }} role="status">Hämtar chatten...</p>
  if (overviewStatus === 'error') return <p style={{ fontSize: 14 }}>Kunde inte hämta chatten just nu. Försök igen senare.</p>
  if (!chat) {
    return <p style={{ fontSize: 14, lineHeight: 1.5 }}>Du är inte med i den här gruppen, så du kan inte se chatten. Bara medlemmar i gruppen kan läsa och skriva i den.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <ChatPrivacyNote />
      <button type="button" className="btn btn-primary" onClick={() => { openChat(group.id); goTo('chatt') }}>
        <Icon name="Message" size={18} />Öppna chatten
        {chat.unreadCount > 0 && <span className="sr-only"> ({formatUnread(chat.unreadCount)} olästa)</span>}
        {chat.unreadCount > 0 && <span className="chat-badge" aria-hidden="true" style={{ background: '#fff', color: '#7D0037' }}>{formatUnread(chat.unreadCount)}</span>}
      </button>
    </div>
  )
}

function GroupCard({ group, churchId }: { group: Group; churchId: number }) {
  const { people, passes, showModal, closeModal, deleteGroup, isAdmin, isSuperAdmin, setGroupLeaders } = useApp()
  const [tab, setTab] = useState<'medlemmar' | 'chatt'>('medlemmar')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const isShared = group.churchId === null || group.churchId === undefined

  const members = people.filter(person => person.church === churchId && person.groups.includes(group.id))
  const groupPasses = passes.filter(passItem => passItem.church === churchId && passItem.groups.includes(group.id))
  // Exakt lista med ansvariga i hela gruppen, så att ingen tappas när en ändras
  const leaderIds = Array.from(new Set(people.filter(p => p.groups.includes(group.id) && p.leaderGroups?.includes(group.id)).map(p => String(p.id))))
  const isLeader = (person: PersonData) => leaderIds.includes(String(person.id))
  // Bara admin för gruppens församling (superadmin för gemensamma grupper). API:t kontrollerar det också.
  const canSetLeaders = isAdmin() && (!isShared || isSuperAdmin())

  const handleDelete = async () => {
    const res = await fetch(`/api/groups/${encodeURIComponent(group.id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      alert('Kunde inte ta bort gruppen: ' + (data.error ?? res.status))
      closeModal()
      return
    }
    deleteGroup(group.id)
    closeModal()
  }

  const toggleLeader = async (person: PersonData, on: boolean) => {
    setSaving(String(person.id)); setError('')
    const err = await setGroupLeaders(group.id, withLeader(leaderIds, String(person.id), on))
    if (err) setError(err)
    setSaving(null)
  }

  return (
    <div className="panel" style={{ padding: '14px 16px', marginBottom: 10 }}>
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
              onConfirm={handleDelete}
            />
          )}><Icon name="Trash" size={18} />Ta bort<span className="sr-only"> {group.label}</span></button>
        )}
      </div>

      <div className="tab-switch" role="group" aria-label={`Visa för ${group.label}`}>
        <button type="button" aria-pressed={tab === 'medlemmar'} className={`tab-switch-btn${tab === 'medlemmar' ? ' on' : ''}`} onClick={() => setTab('medlemmar')}>Medlemmar</button>
        <button type="button" aria-pressed={tab === 'chatt'} className={`tab-switch-btn${tab === 'chatt' ? ' on' : ''}`} onClick={() => setTab('chatt')}>Chatt</button>
      </div>

      {tab === 'chatt' ? <GroupChatTab group={group} /> : (
        <>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)', display: 'flex', gap: 12, marginBottom: members.length ? 8 : 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="Users" size={16} />{members.length} person{members.length !== 1 ? 'er' : ''}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="Calendar" size={16} />{groupPasses.length} pass</span>
          </div>
          {members.length > 0 && (canSetLeaders ? (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
              {members.map(member => (
                <li key={`${member.id}-${member.church}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--linje)' }}>
                  <span style={{ fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {member.name}
                    {isLeader(member) && <span className="chat-leader-tag">Gruppansvarig</span>}
                  </span>
                  <label className="group-leader-toggle">
                    <input
                      type="checkbox"
                      checked={isLeader(member)}
                      disabled={saving !== null}
                      onChange={event => toggleLeader(member, event.target.checked)}
                    />
                    Gruppansvarig<span className="sr-only"> {member.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {members.map(member => (
                <span key={`${member.id}-${member.church}`} className="group-member">
                  {member.name.split(' ')[0]}
                  {isLeader(member) && <span className="chat-leader-tag">Gruppansvarig</span>}
                </span>
              ))}
            </div>
          ))}
          {canSetLeaders && members.length > 0 && (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)', marginTop: 8, lineHeight: 1.4 }}>
              Den som är gruppansvarig får etiketten Gruppansvarig i gruppchatten.
            </p>
          )}
          {error && <div role="alert" className="alert alert-red" style={{ marginTop: 8 }}><Icon name="Alert" size={18} />{error}</div>}
        </>
      )}
    </div>
  )
}

export default function GrupperPage() {
  const { groups, churches, showModal, currentChurchId } = useApp()
  const churchId = currentChurchId()
  const visibleGroups = groups.filter(group => group.churchId === churchId || group.churchId === null)
  const churchName = churches.find(church => church.id === churchId)?.name ?? 'denna församling'

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
        visibleGroups.map(group => <GroupCard key={group.id} group={group} churchId={churchId} />)
      )}
    </div>
  )
}
