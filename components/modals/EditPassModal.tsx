'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import ConfirmModal from './ConfirmModal'

export default function EditPassModal({ passId }: { passId: number }) {
  const { passes, people, groups, closeModal, updatePass, deletePass, showModal, canDeletePass } = useApp()
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  const [title, setTitle] = useState(p.title)
  const [date, setDate] = useState(p.date)
  const [time, setTime] = useState(p.time)
  const [plats, setPlats] = useState(p.plats)
  const [spots, setSpots] = useState(p.spots)
  const [vkProfileId, setVkProfileId] = useState(p.vkProfileId?.toString() || '')
  const [desc, setDesc] = useState(p.desc)
  const [selGroups, setSelGroups] = useState<string[]>(p.groups)
  const [respId, setRespId] = useState(p.responsibleUserIds[0]?.toString() || '')
  const [kioskVisible, setKioskVisible] = useState(p.kioskVisible)
  const [pubDate, setPubDate] = useState(p.pubDate)

  const employees = people.filter(x => x.isEmployee)

  const toggleGroup = (id: string) =>
    setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const save = () => {
    const changed = date !== p.date || time !== p.time || plats !== p.plats
    const vkEmployee = employees.find(e => e.id.toString() === vkProfileId)
    const updated = {
      ...p, title, date, time, plats, spots,
      vk: vkEmployee?.name ?? '', tel: vkEmployee?.phone ?? '', vkProfileId: vkProfileId || null,
      desc, groups: selGroups,
      pubDate, pubStatus: pubDate ? 'scheduled' as const : 'live' as const,
      responsibleUserIds: respId ? [parseInt(respId)] : [],
      kioskVisible,
      history: changed ? [...p.history, 'Datum/tid/plats uppdaterades – Idag'] : p.history,
    }
    updatePass(updated)
    closeModal()
    if (changed && p.bookings.length) {
      setTimeout(() => alert(`Sparat! E-post skickat till ${p.bookings.length} bokade.`), 50)
    }
  }

  return (
    <>
      <div className="modal-header">
        <div className="modal-header-quarter" />
        <div className="modal-title">✏️ Redigera pass</div>
      </div>
      <div className="modal-body">
      {p.bookings.length > 0 && (
        <div className="alert alert-amber">🔔 {p.bookings.length} bokade – de får e-post om datum, tid eller plats ändras.</div>
      )}
      <div className="form-field"><label>Titel</label><input value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label>Datum</label><input value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="form-field"><label>Tid</label><input value={time} onChange={e => setTime(e.target.value)} /></div>
      </div>
      <div className="form-field"><label>Plats</label><input value={plats} onChange={e => setPlats(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label>Antal platser</label><input type="number" value={spots} min={1} onChange={e => setSpots(parseInt(e.target.value)||1)} /></div>
        <div className="form-field">
          <label>Vaktmästare</label>
          <select value={vkProfileId} onChange={e => setVkProfileId(e.target.value)}>
            <option value="">Ingen vaktmästare</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label>Grupper</label>
        <div className="group-grid">
          {groups.map(g => (
            <button key={g.id} className={`group-toggle${selGroups.includes(g.id) ? ' on' : ''}`} onClick={() => toggleGroup(g.id)}>
              {selGroups.includes(g.id) ? '✓ ' : ''}{g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-field">
        <label>Ansvarig anställd</label>
        <select value={respId} onChange={e => setRespId(e.target.value)}>
          <option value="">Ingen ansvarig</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="form-field"><label>Beskrivning</label><textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div className="form-field"><label>Publiceringsdatum (tomt = live direkt)</label><input placeholder="ex. Mån 15 sep" value={pubDate} onChange={e => setPubDate(e.target.value)} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#F1EFE8', borderRadius: 8, marginBottom: 12 }}>
        <button className={`toggle-switch${kioskVisible ? ' on' : ''}`} onClick={() => setKioskVisible(v => !v)} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>Visa i kiosk</div>
          <div style={{ fontSize: 11, color: '#888780' }}>Synlig på anmälningsstationen</div>
        </div>
      </div>
      <div className="modal-footer-split">
        {canDeletePass() ? (
          <button className="btn btn-danger" onClick={() => showModal(
            <ConfirmModal title={`Ta bort "${p.title}"?`} sub="Det går inte att ångra." confirmLabel="Ta bort" onConfirm={() => deletePass(p.id)} />
          )}>🗑 Ta bort</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
          <button className="btn btn-primary" onClick={save}>✓ Spara</button>
        </div>
      </div>
      </div>
    </>
  )
}
