'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls, roleLabel } from '@/lib/appData'
import ConfirmModal from '@/components/modals/ConfirmModal'

function SetPasswordModal({ personId, personName, churchId }: { personId: any; personName: string; churchId: number }) {
  const { closeModal } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (password.length < 8) { setErr('Lösenordet måste vara minst 8 tecken.'); return }
    if (password !== confirm) { setErr('Lösenorden matchar inte.'); return }
    setLoading(true); setErr('')
    const res = await fetch(`/api/people/${personId}/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, church_id: churchId }),
    })
    const d = await res.json()
    if (!res.ok) { setErr(d.error ?? 'Något gick fel.'); setLoading(false); return }
    setDone(true); setLoading(false)
  }

  if (done) return (
    <>
      <div className="alert alert-green">✓ Lösenordet för {personName} har uppdaterats.</div>
      <div className="modal-footer"><button className="btn btn-primary" onClick={closeModal}>Stäng</button></div>
    </>
  )

  return (
    <>
      <div className="modal-title">🔑 Sätt lösenord - {personName}</div>
      <div className="alert alert-blue">Lösenordet sätts på personens gemensamma konto och gäller i alla församlingar där kontot har åtkomst.</div>
      <div className="form-field">
        <label>Nytt lösenord</label>
        <input type="password" placeholder="Minst 8 tecken" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div className="form-field">
        <label>Bekräfta lösenord</label>
        <input type="password" placeholder="Upprepa lösenordet" value={confirm} onChange={e => setConfirm(e.target.value)} />
      </div>
      {err && <div className="alert alert-red">⚠️ {err}</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '🔑 Sätt lösenord'}</button>
      </div>
    </>
  )
}

function InvitePersonModal({ defaultRole = 'ideell' }: { defaultRole?: string }) {
  const { availableChurches, isAdmin, perm, inviteUser, closeModal, currentChurchId } = useApp()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(defaultRole)
  const [churchId, setChurchId] = useState(currentChurchId())
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const canInviteStaff = isAdmin()
  const canInviteIdeell = isAdmin() || perm('kan_lagg_till_personal')

  const send = async () => {
    if (!name.trim() || !email.trim()) { setErr('Namn och e-post krävs'); return }
    if (role === 'ideell' && !canInviteIdeell) { setErr('Du saknar behörighet att bjuda in ideella.'); return }
    if (role !== 'ideell' && !canInviteStaff) { setErr('Endast administratörer kan bjuda in anställda och administratörer.'); return }

    setLoading(true); setErr('')
    try {
      await inviteUser(email.trim(), name.trim(), role, churchId)
      setDone(true)
    } catch (e: any) {
      setErr(e.message)
    }
    setLoading(false)
  }

  if (done) return (
    <>
      <div className="alert alert-green">
        ✓ Inbjudan skickad till {email}. Om personen redan har ett konto används samma konto och den nya församlingen läggs till.
      </div>
      <div className="modal-footer"><button className="btn btn-primary" onClick={closeModal}>Stäng</button></div>
    </>
  )

  return (
    <>
      <div className="modal-title">✉ Bjud in till församling</div>
      <div className="alert alert-blue">
        🔗 Personen får en personlig länk. Ett befintligt konto återanvänds, annars skapas kontot via onboarding.
      </div>
      <div className="form-field"><label>Namn</label><input placeholder="För- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="form-field"><label>E-post</label><input type="email" placeholder="namn@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-field">
          <label>Roll i församlingen</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            <option value="ideell">Ideell</option>
            {canInviteStaff && <option value="anstalld">Anställd</option>}
            {canInviteStaff && <option value="fadmin">Församlingsadmin</option>}
            {canInviteStaff && <option value="padmin">Pastoratsadmin</option>}
          </select>
        </div>
        <div className="form-field">
          <label>Församling</label>
          <select value={churchId} onChange={e => setChurchId(parseInt(e.target.value))}>
            {availableChurches.map(church => <option key={church.id} value={church.id}>{church.name}</option>)}
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

function EditPersonModal({ personId, churchId }: { personId: any; churchId: number }) {
  const { people, groups, closeModal, updatePerson, showModal, deletePerson } = useApp()
  const person = people.find(item => item.id === personId && item.church === churchId)
  if (!person) return null

  const visibleGroups = groups.filter(group => group.churchId === churchId || group.churchId === null)
  const [selGroups, setSelGroups] = useState<string[]>(person.groups)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleGroup = (id: string) => setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const save = async () => {
    setSaving(true); setError('')
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId, groups: selGroups }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Kunde inte spara.')
      setSaving(false)
      return
    }
    updatePerson({ ...person, groups: selGroups })
    setSaving(false)
    closeModal()
  }

  return (
    <>
      <div className="modal-title">✏️ Ändra uppdrag - {person.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#F1EFE8', borderRadius: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: person.av, color: person.ac, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>{person.ini}</div>
        <div><div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{person.name}</div><div style={{ fontSize: 12, color: '#888780' }}>{person.mail}</div></div>
      </div>
      <div className="form-field">
        <label>Uppdragsgrupper i denna församling</label>
        <div className="group-grid">
          {visibleGroups.map(group => (
            <button key={group.id} type="button" className={`group-toggle${selGroups.includes(group.id) ? ' on' : ''}`} onClick={() => toggleGroup(group.id)}>
              {selGroups.includes(group.id) ? '✓ ' : ''}{group.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="alert alert-red">{error}</div>}
      <div className="modal-footer-split">
        <button
          className="btn btn-danger"
          onClick={() => showModal(
            <ConfirmModal
              title={`Ta bort ${person.name} från församlingen?`}
              sub="Personens konto och andra församlingar påverkas inte. Bokningar och uppdrag i denna församling tas bort."
              confirmLabel="Ta bort från församlingen"
              onConfirm={() => deletePerson(person.id)}
            />
          )}
        >
          🗑 Ta bort från församlingen
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Sparar...' : '✓ Spara'}</button>
        </div>
      </div>
    </>
  )
}

export default function PersonalPage() {
  const {
    people, groups, isAdmin, perm, showModal, deletePerson,
    currentChurchId, churches,
  } = useApp()
  const [search, setSearch] = useState('')
  const cid = currentChurchId()
  const regular = people
    .filter(person => person.church === cid)
    .filter(person =>
      !search
      || person.name.toLowerCase().includes(search.toLowerCase())
      || (person.mail ?? '').toLowerCase().includes(search.toLowerCase())
    )

  const canInvite = isAdmin() || perm('kan_lagg_till_personal')
  const churchName = churches.find(church => church.id === cid)?.name ?? ''

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Personal</h1>
          <p className="page-sub">{churchName}</p>
        </div>
        {canInvite && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => showModal(<InvitePersonModal />)}>✉ Bjud in ideell</button>
            {isAdmin() && (
              <button className="btn btn-secondary" onClick={() => showModal(<InvitePersonModal defaultRole="anstalld" />)}>👔 Bjud in anställd</button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 Sök namn eller e-post..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '8px 13px', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10, background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>

      <div className="section-label">Registrerade i {churchName}</div>
      <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '12px 16px' }}>
        <div className="person-list">
          {regular.map(person => {
            const [roleText, roleColor, roleBg] = roleLabel(person)
            return (
              <div key={`${person.id}-${person.church}`} className="person-row">
                <div className="person-av" style={{ background: person.av, color: person.ac }}>{person.ini}</div>
                <div className="person-info">
                  <div className="person-name">
                    {person.name}{' '}
                    <span className="role-tag" style={{ background: roleBg, color: roleColor }}>{roleText}</span>
                    {!person.available && <span className="role-tag" style={{ background: '#FCEBEB', color: '#791F1F', marginLeft: 4 }}>Otillgänglig</span>}
                  </div>
                  <div className="person-email">{person.mail}</div>
                  <div className="person-tags">
                    {person.groups.map(groupId => <span key={groupId} className={`tag ${gCls(groupId, groups)}`}>{gLabel(groupId, groups)}</span>)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {person.mail && canInvite && (
                    <button className="btn btn-secondary btn-sm" title="Skicka ny inbjudan" onClick={async () => {
                      const res = await fetch('/api/invite/resend', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profileId: person.id, churchId: cid }),
                      })
                      const data = await res.json()
                      alert(res.ok ? `✓ Ny inbjudan skickad till ${person.mail}` : `Fel: ${data.error}`)
                    }}>✉️</button>
                  )}
                  {isAdmin() && person.mail && (
                    <button className="btn btn-secondary btn-sm" title="Sätt lösenord" onClick={() => showModal(<SetPasswordModal personId={person.id} personName={person.name} churchId={cid} />)}>🔑</button>
                  )}
                  {canInvite && (
                    <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPersonModal personId={person.id} churchId={cid} />)}>✏️</button>
                  )}
                  {isAdmin() && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => showModal(
                        <ConfirmModal
                          title={`Ta bort ${person.name} från ${churchName}?`}
                          sub="Personens konto och eventuella andra församlingar påverkas inte."
                          confirmLabel="Ta bort från församlingen"
                          onConfirm={() => deletePerson(person.id)}
                        />
                      )}
                    >
                      🗑
                    </button>
                  )}
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
