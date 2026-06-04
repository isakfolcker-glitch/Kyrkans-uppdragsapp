'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls, roleLabel, ini2, PersonData } from '@/lib/appData'
import ConfirmModal from '@/components/modals/ConfirmModal'

function InvitePersonModal() {
  const { churches, isPAdmin, isSuperAdmin, u, inviteUser, closeModal, currentChurchId } = useApp()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('ideell')
  const [churchId, setChurchId] = useState(currentChurchId())
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => {
    if (!name.trim() || !email.trim()) { setErr('Namn och e-post krävs'); return }
    setLoading(true); setErr('')
    try {
      await inviteUser(email.trim(), name.trim(), role, churchId)
      setDone(true)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }
  if (done) return (
    <>
      <div className="alert alert-green">✓ Inbjudan skickad till {email}! De får ett e-postmeddelande med länk för att skapa konto.</div>
      <div className="modal-footer"><button className="btn btn-primary" onClick={closeModal}>Stäng</button></div>
    </>
  )
  return (
    <>
      <div className="modal-title">✉ Bjud in ny användare</div>
      <div className="alert alert-blue">🔗 Personen får ett e-postmeddelande med länk för att skapa sitt konto och lösenord.</div>
      <div className="form-field"><label>Namn</label><input placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field"><label>E-post</label><input type="email" placeholder="namn@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field">
          <label>Roll</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="ideell">Ideell</option>
            <option value="anstalld">Anställd</option>
            {(isPAdmin() || isSuperAdmin()) && <><option value="fadmin">Församlingsadmin</option><option value="padmin">Pastoratsadmin</option></>}
          </select>
        </div>
        <div className="form-field">
          <label>Församling</label>
          <select value={churchId} onChange={e => setChurchId(parseInt(e.target.value))}>
            {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      {err && <div className="alert alert-red">⚠️ {err}</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={send} disabled={loading}>{loading ? 'Skickar...' : '✉ Skicka inbjudan'}</button>
      </div>
    </>
  )
}

function AddPersonModal({ defaultRole = 'ideell' }: { defaultRole?: string }) {
  const { groups, churches, isPAdmin, isSuperAdmin, u, addPerson, nextPersonId, closeModal } = useApp()
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [tel, setTel] = useState('')
  const [role, setRole] = useState(defaultRole)
  const defaultChurchId = (isPAdmin() || isSuperAdmin()) ? (churches[0]?.id ?? 0) : (churches.find(c => c.id === u().churches[0])?.id ?? churches[0]?.id ?? 0)
  const [churchId, setChurchId] = useState(defaultChurchId)
  const [selGroups, setSelGroups] = useState<string[]>([])
  const toggleGroup = (id: string) => setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const save = () => {
    if (!name.trim()) { alert('Namn krävs'); return }
    const adminLevel = role === 'padmin' ? 'pastorat' : role === 'fadmin' ? 'forsamling' : 'none'
    addPerson({ id: nextPersonId(), name: name.trim(), mail, phone: tel, ini: ini2(name), av: '#EEEDFE', ac: '#3C3489', church: churchId, groups: selGroups, role: role as any, isEmployee: role !== 'ideell', adminLevel: adminLevel as any, available: true })
    closeModal()
  }
  const churchOpts = (isPAdmin() || isSuperAdmin()) ? churches : churches.filter(c => c.id !== undefined && u().churches.includes(c.id as number))
  return (
    <>
      <div className="modal-title">👤 Lägg till person</div>
      <div className="form-field"><label>Namn</label><input placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field"><label>E-post</label><input type="email" placeholder="namn@example.com" value={mail} onChange={e => setMail(e.target.value)} /></div>
      <div className="form-field"><label>Telefon</label><input placeholder="070-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field">
          <label>Roll</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="ideell">Ideell</option>
            <option value="anstalld">Anställd</option>
            {(isPAdmin() || isSuperAdmin()) && <><option value="fadmin">Församlingsadmin</option><option value="padmin">Pastoratsadmin</option></>}
          </select>
        </div>
        <div className="form-field">
          <label>Församling</label>
          <select value={churchId} onChange={e => setChurchId(parseInt(e.target.value))}>
            {churchOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      {role === 'ideell' && (
        <div className="form-field">
          <label>Uppdragsgrupper</label>
          <div className="group-grid">
            {groups.map(g => (
              <button key={g.id} className={`group-toggle${selGroups.includes(g.id) ? ' on' : ''}`} onClick={() => toggleGroup(g.id)}>
                {selGroups.includes(g.id) ? '✓ ' : ''}{g.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save}>✉ Lägg till</button>
      </div>
    </>
  )
}

function EditPersonModal({ personId }: { personId: number }) {
  const { people, groups, closeModal, updatePerson, showModal, deletePerson } = useApp()
  const p = people.find(x => x.id === personId)
  if (!p) return null
  const [selGroups, setSelGroups] = useState<string[]>(p.groups)
  const toggleGroup = (id: string) => setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const save = () => { updatePerson({ ...p, groups: selGroups }); closeModal() }
  return (
    <>
      <div className="modal-title">✏️ Ändra uppdrag – {p.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#F1EFE8', borderRadius: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.av, color: p.ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{p.ini}</div>
        <div><div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{p.name}</div><div style={{ fontSize: 12, color: '#888780' }}>{p.mail}</div></div>
      </div>
      <div className="form-field">
        <label>Uppdragsgrupper</label>
        <div className="group-grid">
          {groups.map(g => (
            <button key={g.id} className={`group-toggle${selGroups.includes(g.id) ? ' on' : ''}`} onClick={() => toggleGroup(g.id)}>
              {selGroups.includes(g.id) ? '✓ ' : ''}{g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-footer-split">
        <button className="btn btn-danger" onClick={() => showModal(<ConfirmModal title={`Ta bort ${p.name}?`} sub="Personen förlorar åtkomst." confirmLabel="Ta bort" onConfirm={() => deletePerson(p.id)} />)}>🗑 Ta bort</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
          <button className="btn btn-primary" onClick={save}>✓ Spara</button>
        </div>
      </div>
    </>
  )
}

export default function PersonalPage() {
  const { people, churches, isPAdmin, u, activeChurch, setChurch, showModal, deletePerson, currentChurchId } = useApp()
  const [search, setSearch] = useState('')
  const cid = currentChurchId()
  const all = people.filter(p => p.church === cid && (p as any).role !== 'guest')
  const regular = all.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.mail ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Personal</h1>
          <p className="page-sub">{churches.find(c => c.id === cid)?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => showModal(<InvitePersonModal />)}>✉ Bjud in</button>
          <button className="btn btn-secondary" onClick={() => showModal(<AddPersonModal defaultRole="anstalld" />)}>👔 Ny anställd</button>
          <button className="btn btn-primary" onClick={() => showModal(<AddPersonModal defaultRole="ideell" />)}>+ Ny ideell</button>
        </div>
      </div>

      {isPAdmin() && (
        <div className="church-bar">
          {churches.map((c, i) => <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>{c.name}</button>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 Sök namn eller e-post..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '8px 13px', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10, background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      <div className="section-label">Registrerade</div>
      <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '12px 16px' }}>
        <div className="person-list">
          {regular.map(p => {
            const [rl, rc, rb] = roleLabel(p)
            return (
              <div key={p.id} className="person-row">
                <div className="person-av" style={{ background: p.av, color: p.ac }}>{p.ini}</div>
                <div className="person-info">
                  <div className="person-name">
                    {p.name}{' '}
                    <span className="role-tag" style={{ background: rb, color: rc }}>{rl}</span>
                    {!p.available && <span className="role-tag" style={{ background: '#FCEBEB', color: '#791F1F', marginLeft: 4 }}>Otillgänglig</span>}
                  </div>
                  <div className="person-email">{p.mail}</div>
                  <div className="person-tags">{p.groups.map(g => <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPersonModal personId={p.id} />)}>✏️</button>
                  <button className="btn btn-danger btn-sm" onClick={() => showModal(<ConfirmModal title={`Ta bort ${p.name}?`} sub="Personen förlorar åtkomst och tas bort från alla bokningar." confirmLabel="Ta bort" onConfirm={() => deletePerson(p.id)} />)}>🗑</button>
                </div>
              </div>
            )
          })}
          {regular.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: '#888780', fontSize: 12 }}>Inga registrerade ännu.</div>}
        </div>
      </div>
    </div>
  )
}
