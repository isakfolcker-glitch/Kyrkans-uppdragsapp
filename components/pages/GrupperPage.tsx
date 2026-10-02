'use client'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/lib/appStore'
import { GROUP_COLORS, isGroupEmployee, type GroupManagementData, type ManagedGroup, type GroupPerson } from '@/lib/groupManagement'
import Icon from '@/components/ui/Icon'

function GroupEditor({ group, churchId, churchName, people, onSaved }: {
  group?: ManagedGroup; churchId: number; churchName: string; people: GroupPerson[]; onSaved: (label: string) => void
}) {
  const { closeModal, saveManagedGroup } = useApp()
  const [label, setLabel] = useState(group?.label ?? '')
  const [color, setColor] = useState(group?.cls ?? 'tag-extra')
  const [responsibleId, setResponsibleId] = useState(group?.responsibleProfileId ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(group?.memberIds ?? [])
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const employees = people.filter(isGroupEmployee)
  const filteredPeople = people.filter(person => person.name.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  const toggleMember = (id: string) => setMemberIds(prev => prev.includes(id) ? prev.filter(memberId => memberId !== id) : [...prev, id])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const original = group?.memberIds ?? []
      const saved = await saveManagedGroup({
        id: group?.id, churchId, label, cls: color, responsibleProfileId: responsibleId || null,
        addMemberIds: memberIds.filter(id => !original.includes(id)),
        removeMemberIds: original.filter(id => !memberIds.includes(id)),
      })
      onSaved(saved.label)
      // En användare kan stänga rutan medan svaret väntas. Stäng då inte
      // någon annan ruta som har öppnats efteråt.
      if (mounted.current) closeModal()
    } catch (failure) {
      if (!mounted.current) return
      setError(failure instanceof Error ? failure.message : 'Kunde inte spara gruppen. Försök igen.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="group-editor" aria-busy={saving}>
      <h2 className="modal-title">{group ? 'Redigera grupp' : 'Ny grupp'}</h2>
      <p className="group-help">{churchName}</p>
      {error && <div className="alert alert-red" role="alert">{error}</div>}
      <fieldset disabled={saving} className="group-fieldset">
        <div className="form-field">
          <label htmlFor="grupp-namn">Gruppnamn</label>
          <input id="grupp-namn" value={label} onChange={event => setLabel(event.target.value)} required maxLength={100} autoFocus placeholder="Till exempel Kyrkvärdar" />
        </div>
        <div className="form-field">
          <label htmlFor="grupp-farg">Färg</label>
          <div className="group-color-row">
            <select id="grupp-farg" value={color} onChange={event => setColor(event.target.value)}>
              {!GROUP_COLORS.some(option => option.value === color) && <option value={color}>Nuvarande färg</option>}
              {GROUP_COLORS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <span className={`tag ${color}`}>{label.trim() || 'Gruppnamn'}</span>
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="grupp-ansvarig">Ansvarig anställd</label>
          <select id="grupp-ansvarig" value={responsibleId} onChange={event => setResponsibleId(event.target.value)} aria-describedby="grupp-ansvarig-hjalp">
            <option value="">Ingen ansvarig</option>
            {employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <p id="grupp-ansvarig-hjalp" className="group-help">{employees.length ? 'Ansvarig fungerar som kontaktperson för gruppen.' : 'Det finns inga anställda i församlingen att välja ännu.'}</p>
        </div>
        <div className="group-members-heading">
          <h3>Medlemmar</h3><span className="group-count">{memberIds.length} valda</span>
        </div>
        <div className="form-field">
          <label className="sr-only" htmlFor="grupp-personsok">Sök personer</label>
          <input id="grupp-personsok" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Sök personer i församlingen" />
        </div>
        <div className="group-member-picker" role="group" aria-label="Välj gruppmedlemmar">
          {filteredPeople.map(person => (
            <label key={person.id} className={`group-member-option${memberIds.includes(person.id) ? ' selected' : ''}`}>
              <input type="checkbox" checked={memberIds.includes(person.id)} onChange={() => toggleMember(person.id)} />
              <span className="group-person-name">{person.name}<small>{isGroupEmployee(person) ? 'Anställd' : 'Ideell'}</small></span>
            </label>
          ))}
          {filteredPeople.length === 0 && <p className="group-help group-picker-empty">{people.length ? 'Ingen person matchar sökningen.' : 'Det finns inga personer i församlingen ännu.'}</p>}
        </div>
      </fieldset>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Avbryt</button>
        <button type="submit" className="btn btn-primary" disabled={saving || !label.trim()}>{saving ? 'Sparar…' : group ? 'Spara ändringar' : 'Skapa grupp'}</button>
      </div>
    </form>
  )
}

function DeleteGroupDialog({ group, passCount, onDeleted }: { group: ManagedGroup; passCount: number; onDeleted: () => void }) {
  const { closeModal, removeManagedGroup } = useApp()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const remove = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await removeManagedGroup(group.id)
      onDeleted()
      if (mounted.current) closeModal()
    } catch (failure) {
      if (!mounted.current) return
      setError(failure instanceof Error ? failure.message : 'Kunde inte ta bort gruppen.')
      setSaving(false)
    }
  }
  return (
    <div className="confirm-box">
      <h2 className="modal-title">Ta bort {group.label}?</h2>
      <p className="confirm-sub">Gruppkopplingen tas bort från {group.memberIds.length} personer och {passCount} pass. Personerna och passen finns kvar.</p>
      {error && <div className="alert alert-red" role="alert">{error}</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Avbryt</button>
        <button className="btn btn-danger" onClick={remove} disabled={saving}>{saving ? 'Tar bort…' : 'Ta bort grupp'}</button>
      </div>
    </div>
  )
}

export default function GrupperPage() {
  const { passes, churches, showModal, currentChurchId, getGroupManagement, perm } = useApp()
  const churchId = currentChurchId()
  const canManage = perm('kan_hantera_grupper')
  const churchName = churches.find(church => church.id === churchId)?.name ?? 'Vald församling'
  const [data, setData] = useState<(GroupManagementData & { churchId: number }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<{ churchId: number; message: string } | null>(null)
  const [savedMessage, setSavedMessage] = useState<{ churchId: number; message: string } | null>(null)
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!canManage) return
    getGroupManagement(churchId).then(result => {
      if (!cancelled) { setData({ ...result, churchId }); setLoadError(null); setLoading(false) }
    }).catch(failure => {
      if (!cancelled) { setLoadError({ churchId, message: failure instanceof Error ? failure.message : 'Kunde inte läsa grupperna.' }); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [churchId, canManage, getGroupManagement, revision])

  const current = data?.churchId === churchId ? data : null
  const error = loadError?.churchId === churchId ? loadError.message : ''
  const success = savedMessage?.churchId === churchId ? savedMessage.message : ''
  const groups = current?.groups ?? []
  const people = current?.people ?? []
  const visibleGroups = groups.filter(group => group.label.toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv')))
  const onSaved = (label: string) => { setSavedMessage({ churchId, message: `${label} har sparats.` }); setRevision(value => value + 1) }
  const openEditor = (group?: ManagedGroup) => showModal(<GroupEditor group={group} churchId={churchId} churchName={churchName} people={people} onSaved={onSaved} />)

  if (!canManage) return <div className="empty-state">Du saknar behörighet att hantera grupper i den här församlingen.</div>

  return (
    <div className="groups-page">
      <div className="page-header groups-header">
        <div><h1 className="page-title">Grupper</h1><p className="page-sub">Samla rätt personer och utse en ansvarig i {churchName}.</p></div>
        <button className="btn btn-primary" disabled={!current || !!error} onClick={() => openEditor()}><Icon name="Plus" size={18} />Ny grupp</button>
      </div>
      {success && <div className="alert alert-green" role="status">{success}</div>}
      {error && <div className="alert alert-red" role="alert">{error} <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); setRevision(value => value + 1) }}>Försök igen</button></div>}
      {!current && !error ? <p role="status" className="group-help">Läser grupper…</p> : loading ? <p role="status" className="group-help">Läser grupper…</p> : !error && groups.length === 0 ? (
        <div className="empty-state"><Icon name="UsersGroup" size={36} /><h2>Skapa er första grupp</h2><p>Välj medlemmar och en ansvarig anställd för att komma igång.</p><button className="btn btn-primary" onClick={() => openEditor()}>Skapa grupp</button></div>
      ) : current && !error && (
        <>
          <div className="groups-toolbar">
            <p>{groups.length} grupper · {groups.filter(group => group.responsibleProfileId).length} med ansvarig</p>
            <div className="group-search"><label htmlFor="gruppsok" className="sr-only">Sök grupper</label><Icon name="Search" size={18} /><input id="gruppsok" type="search" placeholder="Sök grupper" value={query} onChange={event => setQuery(event.target.value)} /></div>
          </div>
          {visibleGroups.length === 0 && <div className="empty-state">Ingen grupp matchar sökningen.</div>}
          <div className="groups-grid">
            {visibleGroups.map(group => {
              const members = people.filter(person => group.memberIds.includes(person.id))
              const responsible = people.find(person => person.id === group.responsibleProfileId)
              const passCount = passes.filter(pass => pass.church === churchId && pass.groups.includes(group.id)).length
              const shared = group.churchId == null
              return (
                <article key={group.id} className="panel group-card" aria-label={group.label}>
                  <div className="group-card-top"><span className={`tag ${group.cls}`}><Icon name="UsersGroup" size={16} />{group.label}</span>{shared && <span className="group-count">Gemensam</span>}</div>
                  <div className="group-card-stats"><span><Icon name="Users" size={17} />{members.length} medlemmar</span><span><Icon name="Calendar" size={17} />{passCount} pass</span></div>
                  <div className="group-responsible"><Icon name="UserCheck" size={20} /><div><small>Ansvarig anställd</small><strong>{responsible?.name ?? 'Ingen ansvarig utsedd'}</strong></div></div>
                  {members.length > 0 ? <details className="group-member-details"><summary>Visa medlemmar ({members.length})</summary><ul>{members.map(member => <li key={member.id}>{member.name}</li>)}</ul></details> : <p className="group-help">Inga medlemmar ännu.</p>}
                  <div className="group-card-footer">
                    {shared ? <p className="group-help">Gemensam grupp. Skapa en egen grupp för att hantera medlemmar och ansvarig i församlingen.</p> : <><button className="btn btn-secondary" aria-label={`Redigera ${group.label}`} onClick={() => openEditor(group)}><Icon name="Pencil" size={17} />Redigera grupp</button><button className="group-delete-button" aria-label={`Ta bort ${group.label}`} onClick={() => showModal(<DeleteGroupDialog group={group} passCount={passCount} onDeleted={() => { setSavedMessage({ churchId, message: `${group.label} har tagits bort.` }); setRevision(value => value + 1) }} />)}><Icon name="Trash" size={18} /></button></>}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
