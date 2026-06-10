'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { ini2 } from '@/lib/appData'

export default function ManualAssignModal({ passId }: { passId: number }) {
  const { passes, people, closeModal, addBooking } = useApp()
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [tel, setTel] = useState('')
  const [mail, setMail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendMail, setSendMail] = useState(true)
  const [pasteText, setPasteText] = useState('')
  const [pasteRows, setPasteRows] = useState<{name:string;tel:string;mail:string}[]>([])
  const [progress, setProgress] = useState(0)

  const p = passes.find(x => x.id === passId)
  if (!p) return null
  const candidates = people.filter(x => x.church === p.church && x.name.toLowerCase().includes(search.toLowerCase()))

  const assignPerson = async (personId: any) => {
    const person = people.find(x => x.id === personId)
    if (!person) return
    setLoading(true)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass_id: passId, name: person.name, mail: sendMail ? (person.mail || '') : '', tel: person.phone || '',
        source: 'manual', no_account: false,
        ini: person.ini, av_color: person.av, ac_color: person.ac,
        override_profile_id: personId,
      }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error); setLoading(false); return }
    const booking = await res.json()
    addBooking(passId, { personId, name: person.name, ini: person.ini, av: person.av, ac: person.ac, source: 'manual', noAccount: false, mail: person.mail, tel: person.phone })
    setLoading(false)
    closeModal()
  }

  const saveGuest = async () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    setLoading(true)
    const ini = ini2(name)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass_id: passId, name: name.trim(), mail: sendMail ? (mail || '') : '', tel: tel || '',
        source: 'manual', no_account: true,
        ini, av_color: '#F1EFE8', ac_color: '#5F5E5A',
      }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error); setLoading(false); return }
    addBooking(passId, { personId: null, name: name.trim(), ini, av: '#F1EFE8', ac: '#5F5E5A', source: 'manual', noAccount: true, mail, tel })
    setLoading(false)
    closeModal()
  }

  const parsePasteRows = () => {
    const lines = pasteText.trim().split('\n').filter(l => l.trim())
    const sep = lines[0]?.includes('\t') ? '\t' : ';'
    const rows = lines.map(line => {
      const cols = line.split(sep).map(c => c.trim())
      return { name: cols[0] || '', tel: cols[1] || '', mail: cols[2] || '' }
    }).filter(r => r.name)
    setPasteRows(rows)
    setProgress(0)
  }

  const saveAllGuests = async () => {
    if (!pasteRows.length) return
    setLoading(true)
    setProgress(0)
    let ok = 0
    for (let i = 0; i < pasteRows.length; i++) {
      const row = pasteRows[i]
      const ini = ini2(row.name)
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass_id: passId, name: row.name, mail: sendMail ? row.mail : '', tel: row.tel,
          source: 'manual', no_account: true,
          ini, av_color: '#F1EFE8', ac_color: '#5F5E5A',
        }),
      })
      if (res.ok) {
        addBooking(passId, { personId: null, name: row.name, ini, av: '#F1EFE8', ac: '#5F5E5A', source: 'manual', noAccount: true, mail: row.mail, tel: row.tel })
        ok++
      }
      setProgress(i + 1)
    }
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <div className="modal-title">👤 Tilldela manuellt</div>
      <div className="tab-switch">
        <button className={`tab-switch-btn${tab === 0 ? ' on' : ''}`} onClick={() => setTab(0)}>Sök person</button>
        <button className={`tab-switch-btn${tab === 1 ? ' on' : ''}`} onClick={() => setTab(1)}>Utan konto</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#5F5E5A', margin: '8px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={sendMail} onChange={e => setSendMail(e.target.checked)} />
        Skicka bokningsbekräftelse via e-post
      </label>
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
            <button className="btn btn-secondary" onClick={closeModal} disabled={loading}>Avbryt</button>
          </div>
        </>
      ) : (
        <>
          {pasteRows.length === 0 ? (
            <>
              <div className="form-field"><label>Namn</label><input placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="form-field"><label>Telefon</label><input placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
              <div className="form-field"><label>E-post</label><input type="email" placeholder="namn@example.com" value={mail} onChange={e => setMail(e.target.value)} /></div>

              <div style={{ borderTop: '1px solid #E5E3DC', marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#5F5E5A', marginBottom: 6 }}>📋 Klistra in flera från Excel</div>
                <p style={{ fontSize: 11, color: '#888780', marginBottom: 6 }}>Kolumner: namn → telefon → e-post</p>
                <textarea
                  style={{ width: '100%', height: 72, fontSize: 12, fontFamily: 'monospace', padding: 8, border: '1.5px solid #D3D1C7', borderRadius: 8, resize: 'none', boxSizing: 'border-box' }}
                  placeholder={'Anna Svensson\t073-123456\tanna@mail.se\nErik Johansson\t070-654321'}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeModal} disabled={loading}>Avbryt</button>
                {pasteText.trim() ? (
                  <button className="btn btn-primary" onClick={parsePasteRows}>Förhandsgranska</button>
                ) : (
                  <button className="btn btn-primary" onClick={saveGuest} disabled={loading}>{loading ? 'Sparar...' : '✓ Tilldela'}</button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-blue" style={{ marginBottom: 8 }}>{pasteRows.length} personer redo att bokas</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #E5E3DC', borderRadius: 8, marginBottom: 10 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#F1EFE8' }}>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>Namn</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>Telefon</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>E-post</th>
                  </tr></thead>
                  <tbody>
                    {pasteRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #E5E3DC' }}>
                        <td style={{ padding: '4px 8px' }}>{r.name}</td>
                        <td style={{ padding: '4px 8px' }}>{r.tel}</td>
                        <td style={{ padding: '4px 8px' }}>{r.mail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && (
                <div style={{ background: '#F1EFE8', borderRadius: 8, height: 6, marginBottom: 8 }}>
                  <div style={{ background: '#7D0037', height: '100%', width: `${(progress / pasteRows.length) * 100}%`, transition: 'width 0.3s', borderRadius: 8 }} />
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setPasteRows([]); setPasteText('') }} disabled={loading}>Ändra</button>
                <button className="btn btn-primary" onClick={saveAllGuests} disabled={loading}>
                  {loading ? `Bokar... ${progress}/${pasteRows.length}` : `✓ Boka ${pasteRows.length} pers`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
