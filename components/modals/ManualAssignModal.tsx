'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { ini2 } from '@/lib/appData'

export default function ManualAssignModal({ passId }: { passId: number }) {
  const { passes, people, closeModal, addBooking, addPerson, nextPersonId } = useApp()
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [tel, setTel] = useState('')
  const [mail, setMail] = useState('')

  const p = passes.find(x => x.id === passId)
  if (!p) return null
  const candidates = people.filter(x => x.church === p.church && x.name.toLowerCase().includes(search.toLowerCase()))

  const assignPerson = (personId: number) => {
    const person = people.find(x => x.id === personId)
    if (!person) return
    addBooking(passId, { personId, name: person.name, ini: person.ini, av: person.av, ac: person.ac, source: 'manual', noAccount: false, mail: person.mail, tel: person.phone })
    closeModal()
  }

  const saveGuest = () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    const id = nextPersonId()
    addPerson({ id, name: name.trim(), mail, phone: tel, ini: ini2(name), av: '#F1EFE8', ac: '#5F5E5A', church: p.church, groups: [], role: 'ideell', isEmployee: false, adminLevel: 'none', available: true })
    addBooking(passId, { personId: id, name: name.trim(), ini: ini2(name), av: '#F1EFE8', ac: '#5F5E5A', source: 'manual', noAccount: true, mail, tel })
    closeModal()
  }

  return (
    <>
      <div className="modal-title">👤 Tilldela manuellt</div>
      <div className="tab-switch">
        <button className={`tab-switch-btn${tab === 0 ? ' on' : ''}`} onClick={() => setTab(0)}>Sök person</button>
        <button className={`tab-switch-btn${tab === 1 ? ' on' : ''}`} onClick={() => setTab(1)}>Utan konto</button>
      </div>
      {tab === 0 ? (
        <>
          <div className="form-field">
            <label>Sök</label>
            <input placeholder="Namn..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            {candidates.map(person => (
              <div key={person.id} className="search-row" onClick={() => assignPerson(person.id)}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: person.av, color: person.ac, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{person.ini}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{person.name}</div>
                  <div style={{ fontSize: 11, color: '#888780' }}>{person.groups.map(g => g).join(', ') || 'Inga grupper'}</div>
                </div>
                <span style={{ color: '#888780' }}>›</span>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
          </div>
        </>
      ) : (
        <>
          <div className="form-field"><label>Namn</label><input placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="form-field"><label>Telefon</label><input placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
          <div className="form-field"><label>E-post</label><input type="email" placeholder="namn@example.com" value={mail} onChange={e => setMail(e.target.value)} /></div>
          <div className="alert alert-blue" style={{ marginTop: 0 }}>🔗 Kopplas till konto automatiskt om e-post matchar senare.</div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
            <button className="btn btn-primary" onClick={saveGuest}>✓ Tilldela</button>
          </div>
        </>
      )}
    </>
  )
}
