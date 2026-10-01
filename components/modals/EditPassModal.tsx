'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon, { PassMeta } from '@/components/ui/Icon'
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
      <h2 className="modal-title">Redigera pass</h2>
      {p.bookings.length > 0 && (
        <div className="alert alert-amber"><Icon name="Bell" size={18} />{p.bookings.length} bokade. De får e-post om datum, tid eller plats ändras.</div>
      )}
      <div className="form-field"><label htmlFor="editpassmoda-f2">Titel</label><input id="editpassmoda-f2" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label htmlFor="editpassmoda-f3">Datum</label><input id="editpassmoda-f3" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="editpassmoda-f4">Tid</label><input id="editpassmoda-f4" value={time} onChange={e => setTime(e.target.value)} /></div>
      </div>
      <div className="form-field"><label htmlFor="editpassmoda-f5">Plats</label><input id="editpassmoda-f5" value={plats} onChange={e => setPlats(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label htmlFor="editpassmoda-f6">Antal platser</label><input id="editpassmoda-f6" type="number" value={spots} min={1} onChange={e => setSpots(parseInt(e.target.value)||1)} /></div>
        <div className="form-field">
          <label htmlFor="editpassmoda-f7">Vaktmästare</label>
          <select id="editpassmoda-f7" value={vkProfileId} onChange={e => setVkProfileId(e.target.value)}>
            <option value="">Ingen vaktmästare</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-field">
        <div className="field-label" id="editpassmoda-g1">Grupper</div>
        <div className="group-grid" role="group" aria-labelledby="editpassmoda-g1">
          {groups.map(g => (
            <button key={g.id} type="button" aria-pressed={selGroups.includes(g.id)} className={`group-toggle${selGroups.includes(g.id) ? ' on' : ''}`} onClick={() => toggleGroup(g.id)}>
              {selGroups.includes(g.id) && <Icon name="Check" size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />}{g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="editpassmoda-f8">Ansvarig anställd</label>
        <select id="editpassmoda-f8" value={respId} onChange={e => setRespId(e.target.value)}>
          <option value="">Ingen ansvarig</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="form-field"><label htmlFor="editpassmoda-f9">Beskrivning</label><textarea id="editpassmoda-f9" value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="editpassmoda-f10">Publiceringsdatum (tomt = live direkt)</label><input id="editpassmoda-f10" placeholder="ex. Mån 15 sep" value={pubDate} onChange={e => setPubDate(e.target.value)} /></div>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12 }}>
        <button type="button" role="switch" aria-checked={kioskVisible} aria-label="Visa passet i kiosk" className={`toggle-switch${kioskVisible ? ' on' : ''}`} onClick={() => setKioskVisible(v => !v)} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>Visa i kiosk</div>
          <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>Synlig på anmälningsstationen</div>
        </div>
      </div>
      <div className="modal-footer-split">
        {canDeletePass() ? (
          <button className="btn btn-danger" onClick={() => showModal(
            <ConfirmModal title={`Ta bort "${p.title}"?`} sub="Det går inte att ångra." confirmLabel="Ta bort" onConfirm={() => deletePass(p.id)} />
          )}><Icon name="Trash" size={18} />Ta bort</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
          <button className="btn btn-primary" onClick={save}>Spara</button>
        </div>
      </div>
    </>
  )
}
