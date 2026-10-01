'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon, { PassMeta } from '@/components/ui/Icon'
import { avBg, avFg, DEFAULT_AV, DEFAULT_AC } from '@/lib/avatarColors'
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
    addBooking(passId, { id: booking.id, personId, name: person.name, ini: person.ini, av: person.av, ac: person.ac, source: 'manual', noAccount: false, mail: person.mail, tel: person.phone })
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
        ini, av_color: DEFAULT_AV, ac_color: DEFAULT_AC,
      }),
    })
    if (!res.ok) { const d = await res.json(); alert(d.error); setLoading(false); return }
    const booking = await res.json()
    addBooking(passId, { id: booking.id, personId: null, name: name.trim(), ini, av: DEFAULT_AV, ac: DEFAULT_AC, source: 'manual', noAccount: true, mail, tel })
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
          ini, av_color: DEFAULT_AV, ac_color: DEFAULT_AC,
        }),
      })
      if (res.ok) {
        const booking = await res.json()
        addBooking(passId, { id: booking.id, personId: null, name: row.name, ini, av: DEFAULT_AV, ac: DEFAULT_AC, source: 'manual', noAccount: true, mail: row.mail, tel: row.tel })
        ok++
      }
      setProgress(i + 1)
    }
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">Tilldela manuellt</h2>
      <div className="tab-switch">
        <button type="button" aria-pressed={tab === 0} className={`tab-switch-btn${tab === 0 ? ' on' : ''}`} onClick={() => setTab(0)}>Sök person</button>
        <button type="button" aria-pressed={tab === 1} className={`tab-switch-btn${tab === 1 ? ' on' : ''}`} onClick={() => setTab(1)}>Utan konto</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: '#000', minHeight: 44, margin: '4px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={sendMail} onChange={e => setSendMail(e.target.checked)} style={{ accentColor: '#7D0037', width: 20, height: 20 }} />
        Skicka bokningsbekräftelse via e-post
      </label>
      {tab === 0 ? (
        <>
          <div className="form-field">
            <label htmlFor="manualassign-f1">Sök</label>
            <input id="manualassign-f1" placeholder="Namn..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            {candidates.map(person => (
              <button key={person.id} type="button" className="pick-row" onClick={() => assignPerson(person.id)}>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '50%', background: avBg(person.av), color: avFg(person.ac), fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{person.ini}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>{person.name}</span>
                  <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>{person.groups.map(g => g).join(', ') || 'Inga grupper'}</span>
                </span>
                <Icon name="ChevronRight" size={18} style={{ color: '#7D0037' }} />
              </button>
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
              <div className="form-field"><label htmlFor="manualassign-f2">Namn</label><input id="manualassign-f2" placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="form-field"><label htmlFor="manualassign-f3">Telefon</label><input id="manualassign-f3" placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
              <div className="form-field"><label htmlFor="manualassign-f4">E-post</label><input id="manualassign-f4" type="email" placeholder="namn@example.com" value={mail} onChange={e => setMail(e.target.value)} /></div>

              <div style={{ borderTop: '1px solid rgba(125,0,55,0.18)', marginTop: 12, paddingTop: 12 }}>
                <div id="manual-paste-rubrik" style={{ fontSize: 15, fontWeight: 500, color: '#000', marginBottom: 6 }}>Klistra in flera från Excel</div>
                <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginBottom: 6 }}>Kolumner: namn, telefon, e-post</p>
                <textarea
                  aria-labelledby="manual-paste-rubrik"
                  style={{ width: '100%', height: 72, fontSize: 13, fontFamily: 'monospace', padding: 8, border: '1.5px solid rgba(125,0,55,0.35)', borderRadius: 8, resize: 'none', boxSizing: 'border-box' }}
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
                  <button className="btn btn-primary" onClick={saveGuest} disabled={loading}>{loading ? 'Sparar...' : 'Tilldela'}</button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="alert alert-blue" style={{ marginBottom: 8 }}>{pasteRows.length} personer redo att bokas</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid rgba(125,0,55,0.18)', borderRadius: 8, marginBottom: 10 }}>
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'rgba(125,0,55,0.06)' }}>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>Namn</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>Telefon</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>E-post</th>
                  </tr></thead>
                  <tbody>
                    {pasteRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid rgba(125,0,55,0.18)' }}>
                        <td style={{ padding: '4px 8px' }}>{r.name}</td>
                        <td style={{ padding: '4px 8px' }}>{r.tel}</td>
                        <td style={{ padding: '4px 8px' }}>{r.mail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && (
                <div style={{ background: 'rgba(125,0,55,0.06)', borderRadius: 8, height: 6, marginBottom: 8 }}>
                  <div style={{ background: '#7D0037', height: '100%', width: `${(progress / pasteRows.length) * 100}%`, transition: 'width 0.3s', borderRadius: 8 }} />
                </div>
              )}
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setPasteRows([]); setPasteText('') }} disabled={loading}>Ändra</button>
                <button className="btn btn-primary" onClick={saveAllGuests} disabled={loading}>
                  {loading ? `Bokar... ${progress} av ${pasteRows.length}` : `Boka ${pasteRows.length} personer`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
