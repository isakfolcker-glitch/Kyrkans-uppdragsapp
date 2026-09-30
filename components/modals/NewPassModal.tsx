'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon, { PassMeta } from '@/components/ui/Icon'
import { validatePassForm } from '@/lib/passValidation'
import type { PassFormErrors } from '@/lib/passValidation'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div role="alert" style={{ color: '#7D0037', fontSize: 14, fontWeight: 500, marginTop: 6 }}>
      {message}
    </div>
  )
}

export default function NewPassModal() {
  const { groups, people, closeModal, addPass, nextPassId, currentChurchId, u } = useApp()
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
  const [errors, setErrors] = useState<PassFormErrors>({})

  const employees = people.filter(p => p.isEmployee)

  const toggleGroup = (id: string) => {
    setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    setErrors(prev => ({ ...prev, groups: undefined }))
  }

  const save = async () => {
    const nextErrors = validatePassForm({
      title,
      date,
      timeStart,
      plats,
      spots,
      groups: selGroups,
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const time = timeStart && timeEnd ? `${timeStart}-${timeEnd}` : timeStart || timeEnd || ''
    const vkEmployee = employees.find(e => e.id.toString() === vkProfileId)
    await addPass({
      id: nextPassId(), church: currentChurchId(), title: title.trim(), date, time, plats: plats.trim(), spots, filled: 0,
      vk: vkEmployee?.name ?? '', tel: vkEmployee?.phone ?? '', vkProfileId: vkProfileId || null,
      desc: desc.trim(), groups: selGroups, cancelled: false,
      pubStatus: pubDate ? 'scheduled' : 'live', pubDate, kioskVisible,
      responsibleUserIds: respId ? [parseInt(respId)] : [],
      bookings: [], history: [`Skapades av ${u().name} - Idag`],
    })
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">Nytt pass</h2>

      <div className="form-field">
        <label htmlFor="newpassmodal-f2">Titel <span aria-hidden="true">*</span></label>
        <input id="newpassmodal-f2"
          placeholder="ex. Söndagsgudstjänst"
          value={title}
          required
          aria-invalid={Boolean(errors.title)}
          onChange={e => {
            setTitle(e.target.value)
            setErrors(prev => ({ ...prev, title: undefined }))
          }}
        />
        <FieldError message={errors.title} />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="newpassmodal-f3">Datum <span aria-hidden="true">*</span></label>
          <input id="newpassmodal-f3"
            type="date"
            value={date}
            required
            aria-invalid={Boolean(errors.date)}
            onChange={e => {
              setDate(e.target.value)
              setErrors(prev => ({ ...prev, date: undefined }))
            }}
          />
          <FieldError message={errors.date} />
        </div>
        <div className="form-field">
          <label htmlFor="newpassmodal-f4">Starttid <span aria-hidden="true">*</span></label>
          <input id="newpassmodal-f4"
            type="time"
            value={timeStart}
            required
            aria-invalid={Boolean(errors.timeStart)}
            onChange={e => {
              setTimeStart(e.target.value)
              setErrors(prev => ({ ...prev, timeStart: undefined }))
            }}
          />
          <FieldError message={errors.timeStart} />
        </div>
        <div className="form-field">
          <label htmlFor="newpassmodal-f5">Sluttid</label>
          <input id="newpassmodal-f5" type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="newpassmodal-f6">Plats <span aria-hidden="true">*</span></label>
        <input id="newpassmodal-f6"
          placeholder="ex. Kyrkorummet"
          value={plats}
          required
          aria-invalid={Boolean(errors.plats)}
          onChange={e => {
            setPlats(e.target.value)
            setErrors(prev => ({ ...prev, plats: undefined }))
          }}
        />
        <FieldError message={errors.plats} />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="newpassmodal-f7">Antal platser <span aria-hidden="true">*</span></label>
          <input id="newpassmodal-f7"
            type="number"
            value={spots}
            min={1}
            required
            aria-invalid={Boolean(errors.spots)}
            onChange={e => {
              setSpots(parseInt(e.target.value) || 1)
              setErrors(prev => ({ ...prev, spots: undefined }))
            }}
          />
          <FieldError message={errors.spots} />
        </div>
        <div className="form-field">
          <label htmlFor="newpassmodal-f8">Vaktmästare</label>
          <select id="newpassmodal-f8" value={vkProfileId} onChange={e => setVkProfileId(e.target.value)}>
            <option value="">Ingen vaktmästare</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
      </div>

      <div className="form-field">
        <div className="field-label" id="newpassmodal-g1">Grupper <span aria-hidden="true">*</span></div>
        <div className="group-grid" role="group" aria-labelledby="newpassmodal-g1">
          {groups.map(g => (
            <button
              key={g.id}
              type="button"
              className={`group-toggle${selGroups.includes(g.id) ? ' on' : ''}`}
              aria-pressed={selGroups.includes(g.id)}
              onClick={() => toggleGroup(g.id)}
            >
              {selGroups.includes(g.id) && <Icon name="Check" size={16} style={{ verticalAlign: '-3px', marginRight: 4 }} />}{g.label}
            </button>
          ))}
        </div>
        <FieldError message={errors.groups} />
      </div>

      <div className="form-field">
        <label htmlFor="newpassmodal-f9">Ansvarig anställd</label>
        <select id="newpassmodal-f9" value={respId} onChange={e => setRespId(e.target.value)}>
          <option value="">Ingen ansvarig</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="newpassmodal-f10">Beskrivning</label>
        <textarea id="newpassmodal-f10" placeholder="Vad händer i kyrkan..." value={desc} onChange={e => setDesc(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="newpassmodal-f11">Publiceringsdatum (tomt = live direkt)</label>
        <input id="newpassmodal-f11" type="date" value={pubDate} onChange={e => setPubDate(e.target.value)} />
      </div>

      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 12 }}>
        <button
          type="button"
          className={`toggle-switch${kioskVisible ? ' on' : ''}`}
          role="switch"
          aria-checked={kioskVisible}
          aria-label="Visa passet i kiosk"
          onClick={() => setKioskVisible(v => !v)}
        />
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>Visa i kiosk</div>
          <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>Synlig på anmälningsstationen</div>
        </div>
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>Spara</button>
      </div>
    </>
  )
}
