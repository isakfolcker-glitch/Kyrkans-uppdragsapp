'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { roleLabel } from '@/lib/appData'
import { createClient } from '@/lib/supabase/client'

function PermModal({ personId }: { personId: any }) {
  const { people, passes, closeModal, updatePerson, updatePass, isPAdmin, isSuperAdmin, profile } = useApp()
  const p = people.find(x => x.id === personId)
  if (!p) return null

  const [isEmp, setIsEmp]   = useState(p.isEmployee)
  const [lvl, setLvl]       = useState(p.adminLevel)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  const myPasses = passes.filter(x => x.church === p.church)
  const [respPasses, setRespPasses] = useState<any[]>(
    myPasses.filter(x => x.responsibleUserIds.includes(personId)).map(x => x.id)
  )
  const togglePass = (id: any) =>
    setRespPasses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const newRole = lvl === 'pastorat' ? 'padmin'
    : lvl === 'forsamling' ? 'fadmin'
    : isEmp ? 'anstalld' : 'ideell'

  const save = async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()

    // Uppdatera profil i Supabase
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ is_employee: isEmp, admin_level: lvl, role: newRole })
      .eq('id', personId)

    if (profErr) { setError(profErr.message); setLoading(false); return }

    // Uppdatera ansvariga pass
    for (const pass of myPasses) {
      const shouldHave = respPasses.includes(pass.id)
      const hasNow     = pass.responsibleUserIds.includes(personId)
      if (shouldHave === hasNow) continue

      if (shouldHave) {
        await supabase.from('pass_responsible').insert({ pass_id: pass.id, profile_id: personId })
      } else {
        await supabase.from('pass_responsible').delete()
          .eq('pass_id', pass.id).eq('profile_id', personId)
      }
      updatePass({
        ...pass,
        responsibleUserIds: shouldHave
          ? [...pass.responsibleUserIds, personId]
          : pass.responsibleUserIds.filter((id: any) => id !== personId),
      })
    }

    // Uppdatera lokalt state
    updatePerson({ ...p, isEmployee: isEmp, adminLevel: lvl as any, role: newRole })
    setLoading(false)
    closeModal()
  }

  const canFAdmin = isPAdmin() || isSuperAdmin() || profile?.admin_level === 'forsamling'
  const canPAdmin = isPAdmin() || isSuperAdmin()

  const ini = p.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div className="modal-title">🛡 Behörighet – {p.name}</div>

      {/* Personkort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#FFEBE1', borderRadius: 12, marginBottom: 18 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: '#7D0037',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>{ini}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{p.name}</div>
          <div style={{ fontSize: 12, color: '#5F5E5A' }}>{p.mail}</div>
        </div>
      </div>

      <div className="form-field">
        <label>Anställd eller ideell?</label>
        <select value={isEmp ? 'true' : 'false'} onChange={e => setIsEmp(e.target.value === 'true')}>
          <option value="false">Ideell volontär</option>
          <option value="true">Anställd</option>
        </select>
      </div>

      <div className="form-field">
        <label>Adminnivå</label>
        <select value={lvl} onChange={e => setLvl(e.target.value as any)}>
          <option value="none">Ingen admin</option>
          {canFAdmin && <option value="forsamling">Församlingsadmin</option>}
          {canPAdmin && <option value="pastorat">Pastoratsadmin</option>}
          {isSuperAdmin() && <option value="super">Superadmin</option>}
        </select>
      </div>

      {myPasses.length > 0 && (
        <div className="form-field">
          <label>Ansvarig för pass</label>
          <div style={{ background: '#FFEBE1', borderRadius: 10, padding: 12, maxHeight: 160, overflowY: 'auto' }}>
            {myPasses.map(x => (
              <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={respPasses.includes(x.id)}
                  onChange={() => togglePass(x.id)}
                  style={{ accentColor: '#7D0037', width: 15, height: 15 }}
                />
                <span style={{ fontSize: 13 }}>{x.title} <span style={{ color: '#BC8E4C' }}>({x.date})</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="alert alert-red">{error}</div>}

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>
          {loading ? 'Sparar...' : '✓ Spara'}
        </button>
      </div>
    </>
  )
}

export default function BehorigheterPage() {
  const { people, churches, isPAdmin, isSuperAdmin, profile, showModal } = useApp()

  // Samla kyrk-id:n som inloggad admin kan hantera
  const myChurchId = profile?.church_id
  const churchGroups: { id: any; name: string; members: typeof people }[] = []

  if (isSuperAdmin() || isPAdmin()) {
    churches.forEach((c: any, i: number) => {
      const members = people.filter(p => p.church === (c.id ?? i))
      if (members.length) churchGroups.push({ id: c.id ?? i, name: c.name, members })
    })
  } else if (myChurchId) {
    const c = churches.find((c: any) => c.id === myChurchId)
    const members = people.filter(p => p.church === myChurchId)
    if (members.length) churchGroups.push({ id: myChurchId, name: c?.name ?? 'Din kyrka', members })
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Behörigheter</h1>
        <p className="page-sub">Ändra roller och pass-ansvar</p>
      </div>

      {churchGroups.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid rgba(125,0,55,0.08)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#000' }}>Ingen personal att visa</div>
        </div>
      )}

      {churchGroups.map(({ id, name, members }) => (
        <div key={id}>
          <div className="section-label">{name}</div>
          <div style={{ background: '#fff', border: '1px solid rgba(125,0,55,0.08)', borderRadius: 16, padding: '4px 16px', marginBottom: 16 }}>
            <div className="person-list">
              {members.map(p => {
                const [rl, rc, rb] = roleLabel(p)
                const ini = p.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={p.id} className="person-row">
                    <div className="person-av" style={{ background: '#7D0037', color: '#fff' }}>{ini}</div>
                    <div className="person-info">
                      <div className="person-name">{p.name}</div>
                      <div className="person-email">{p.mail}</div>
                      <div className="person-tags">
                        <span className="role-tag" style={{ background: rb, color: rc }}>{rl}</span>
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => showModal(<PermModal personId={p.id} />)}
                    >
                      🛡 Ändra
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
