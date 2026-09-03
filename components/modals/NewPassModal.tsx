'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'

export default function NewPassModal() {
  const { groups, people, closeModal, addPass, nextPassId, isPAdmin, currentChurchId, u } = useApp()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [plats, setPlats] = useState('')
  const [spots, setSpots] = useState(2)
  const [vkProfileId, setVkProfileId] = useState('')
  const [desc, setDesc] = useState('')
  const [selGroups, setSelGroups] = useState<string[]>([])
  const [respId, setRespId] = useState('')
  const [kioskVisible, setKioskVisible] = useState(false)
  const [pubDate, setPubDate] = useState('')

  const employees = people.filter(p => p.isEmployee)

  const toggleGroup = (id: string) =>
    setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const save = async () => {
    if (!title.trim()) { alert('Titel krävs'); return }
    const time = timeStart && timeEnd ? `${timeStart}–${timeEnd}` : timeStart || timeEnd || ''
    const vkEmployee = employees.find(e => e.id.toString() === vkProfileId)
    await addPass({
      id: nextPassId(), church: currentChurchId(), title, date, time, plats, spots, filled: 0,
      vk: vkEmployee?.name ?? '', tel: vkEmployee?.phone ?? '', vkProfileId: vkProfileId || null,
      desc, groups: selGroups, cancelled: false,
      pubStatus: pubDate ? 'scheduled' : 'live', pubDate, kioskVisible,
      responsibleUserIds: respId ? [parseInt(respId)] : [],
      bookings: [], history: [`Skapades av ${u().name} – Idag`],
    })
    closeModal()
  }

  return (
    <>
      <div className="modal-title">📅 Nytt pass</div>
      <div className="form-field"><label>Titel</label><input placeholder="ex. Söndagsgudstjänst" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field"><label>Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="form-field"><label>Starttid</label><input type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} /></div>
        <div className="form-field"><label>Sluttid</label><input type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} /></div>
      </div>
      <div className="form-field"><label>Plats</label><input placeholder="ex. Kyrkorummet" value={plats} onChange={e => setPlats(e.target.value)} /></div>
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
      <div className="form-field"><label>Beskrivning</label><textarea placeholder="Vad händer i kyrkan..." value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div className="form-field"><label>Publiceringsdatum (tomt = live direkt)</label><input type="date" value={pubDate} onChange={e => setPubDate(e.target.value)} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: '#F1EFE8', borderRadius: 8, marginBottom: 12 }}>
        <button className={`toggle-switch${kioskVisible ? ' on' : ''}`} onClick={() => setKioskVisible(v => !v)} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>Visa i kiosk</div>
          <div style={{ fontSize: 11, color: '#888780' }}>Synlig på anmälningsstationen</div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={() => save()}>✓ Spara</button>
      </div>
    </>
  )
}
