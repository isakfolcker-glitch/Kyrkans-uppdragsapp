'use client'
import { useState, useEffect } from 'react'
import { useApp } from '@/lib/appStore'
import { roleLabel } from '@/lib/appData'
import { createClient } from '@/lib/supabase/client'
import type { StaffPerms } from '@/lib/appStore'

const PERM_DEFS: { key: keyof StaffPerms; lbl: string; sub: string; icon: string }[] = [
  { key: 'kan_skapa_pass',         lbl: 'Skapa pass',                icon: '📅', sub: 'Lägga till nya pass i schemat' },
  { key: 'kan_redigera_pass',      lbl: 'Redigera & ställa in pass', icon: '✏️', sub: 'Ändra och avboka befintliga pass' },
  { key: 'kan_se_bokningar',       lbl: 'Se bokningar',              icon: '👁',  sub: 'Visa vilka som är bokade på pass' },
  { key: 'kan_hantera_bokningar',  lbl: 'Hantera bokningar',         icon: '📋', sub: 'Lägga till och ta bort bokade personer' },
  { key: 'kan_se_personal',        lbl: 'Se personal',               icon: '👥', sub: 'Visa personallistan' },
  { key: 'kan_lagg_till_personal', lbl: 'Lägga till personal',       icon: '➕', sub: 'Bjuda in ideella och lägga till folk i egna grupper' },
  { key: 'kan_hantera_grupper',    lbl: 'Hantera grupper',           icon: '🏷',  sub: 'Skapa, redigera och ta bort grupper' },
  { key: 'kan_skicka_utskick',     lbl: 'Skicka utskick',           icon: '✉️', sub: 'Skicka mail och notiser till grupper' },
]

const EMPTY_PERMS: StaffPerms = {
  kan_skapa_pass: false, kan_redigera_pass: false,
  kan_se_bokningar: false, kan_hantera_bokningar: false,
  kan_se_personal: false, kan_lagg_till_personal: false,
  kan_hantera_grupper: false, kan_skicka_utskick: false,
}

function PermModal({ personId }: { personId: any }) {
  const { people, passes, closeModal, updatePerson, updatePass, isPAdmin, isSuperAdmin, isFAdmin } = useApp()
  const p = people.find(x => x.id === personId)
  if (!p) return null

  const [isEmp, setIsEmp] = useState(p.isEmployee)
  const [lvl, setLvl]     = useState(p.adminLevel)
  const [perms, setPerms] = useState<StaffPerms>(EMPTY_PERMS)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (p.role !== 'anstalld') return
    createClient().from('staff_permissions').select('*').eq('profile_id', personId).single().then(({ data }) => {
      if (data) setPerms({
        kan_skapa_pass: data.kan_skapa_pass, kan_redigera_pass: data.kan_redigera_pass,
        kan_se_bokningar: data.kan_se_bokningar, kan_hantera_bokningar: data.kan_hantera_bokningar,
        kan_se_personal: data.kan_se_personal, kan_lagg_till_personal: data.kan_lagg_till_personal,
        kan_hantera_grupper: data.kan_hantera_grupper, kan_skicka_utskick: data.kan_skicka_utskick,
      })
    })
  }, [personId, p.role])

  const myPasses = passes.filter(x => x.church === p.church)
  const [respPasses, setRespPasses] = useState<any[]>(
    myPasses.filter(x => x.responsibleUserIds.includes(personId)).map(x => x.id)
  )
  const togglePass = (id: any) =>
    setRespPasses(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const isAdminLevel = ['forsamling','pastorat','super'].includes(lvl)
  const newRole = lvl === 'pastorat' ? 'padmin' : lvl === 'forsamling' ? 'fadmin' : isEmp ? 'anstalld' : 'ideell'

  const save = async () => {
    setLoading(true); setError('')
    const supabase = createClient()

    const { error: profErr } = await supabase
      .from('profiles')
      .update({ is_employee: isEmp, admin_level: lvl, role: newRole })
      .eq('id', personId)
    if (profErr) { setError(profErr.message); setLoading(false); return }

    if (isEmp && !isAdminLevel) {
      await supabase.from('staff_permissions').upsert({ profile_id: personId, ...perms }, { onConflict: 'profile_id' })
    } else if (isAdminLevel) {
      await supabase.from('staff_permissions').delete().eq('profile_id', personId)
    }

    for (const pass of myPasses) {
      const shouldHave = respPasses.includes(pass.id)
      const hasNow     = pass.responsibleUserIds.includes(personId)
      if (shouldHave === hasNow) continue
      if (shouldHave) {
        await supabase.from('pass_responsible').insert({ pass_id: pass.id, profile_id: personId })
      } else {
        await supabase.from('pass_responsible').delete().eq('pass_id', pass.id).eq('profile_id', personId)
      }
      updatePass({ ...pass, responsibleUserIds: shouldHave ? [...pass.responsibleUserIds, personId] : pass.responsibleUserIds.filter((id: any) => id !== personId) })
    }

    updatePerson({ ...p, isEmployee: isEmp, adminLevel: lvl as any, role: newRole })
    setLoading(false)
    closeModal()
  }

  const ini = p.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <div className="modal-header">
        <div className="modal-header-quarter" />
        <div className="modal-title">🛡 Behörighet – {p.name}</div>
      </div>
      <div className="modal-body">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#FFEBE1', borderRadius: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#7D0037', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{ini}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{p.name}</div>
          <div style={{ fontSize: 12, color: '#5F5E5A' }}>{p.mail}</div>
        </div>
      </div>

      {/* Rollväljare */}
      <div className="form-field">
        <label>Roll</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <RollBtn active={!isEmp && lvl === 'none'} onClick={() => { setIsEmp(false); setLvl('none') }} color="#FFEBE1" border="#7D0037">👤 Ideell</RollBtn>
          <RollBtn active={isEmp && lvl === 'none'} onClick={() => { setIsEmp(true); setLvl('none') }} color="#FFEBE1" border="#7D0037">👔 Anställd</RollBtn>
          {(isFAdmin() || isPAdmin() || isSuperAdmin()) && (
            <RollBtn active={lvl === 'forsamling'} onClick={() => { setIsEmp(true); setLvl('forsamling') }} color="#BEE1C8" border="#28A88E">🏛 Församlingsadmin</RollBtn>
          )}
          {(isPAdmin() || isSuperAdmin()) && (
            <RollBtn active={lvl === 'pastorat'} onClick={() => { setIsEmp(true); setLvl('pastorat') }} color="#FAEEDA" border="#BC8E4C">🌐 Pastoratsadmin</RollBtn>
          )}
        </div>
      </div>

      {/* Checkboxar för anställda utan admin-nivå */}
      {isEmp && !isAdminLevel && (
        <div className="form-field">
          <label>Behörigheter</label>
          <div style={{ background: '#FFEBE1', borderRadius: 12, border: '1px solid rgba(125,0,55,0.1)', overflow: 'hidden' }}>
            {PERM_DEFS.map((def, i) => (
              <label key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer', borderBottom: i < PERM_DEFS.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', background: perms[def.key] ? 'rgba(125,0,55,0.04)' : 'transparent' }}>
                <input type="checkbox" checked={perms[def.key]} onChange={e => setPerms(prev => ({ ...prev, [def.key]: e.target.checked }))} style={{ accentColor: '#7D0037', width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>{def.icon} {def.lbl}</div>
                  <div style={{ fontSize: 11, color: '#5F5E5A', marginTop: 1 }}>{def.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {isAdminLevel && (
        <div className="alert alert-green">✓ Admin-nivå ger automatiskt alla behörigheter.</div>
      )}

      {/* Pass-ansvar */}
      {myPasses.length > 0 && (
        <div className="form-field">
          <label>Ansvarig för pass</label>
          <div style={{ background: '#FFEBE1', borderRadius: 10, padding: 12, maxHeight: 160, overflowY: 'auto' }}>
            {myPasses.map(x => (
              <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={respPasses.includes(x.id)} onChange={() => togglePass(x.id)} style={{ accentColor: '#7D0037', width: 15, height: 15 }} />
                <span style={{ fontSize: 13 }}>{x.title} <span style={{ color: '#BC8E4C' }}>({x.date})</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="alert alert-red">{error}</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : '✓ Spara'}</button>
      </div>
      </div>
    </>
  )
}

function RollBtn({ active, onClick, color, border, children }: any) {
  return (
    <button onClick={onClick} style={{ flex: 1, minWidth: 120, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${active ? border : 'rgba(0,0,0,0.12)'}`, background: active ? color : '#fff', fontWeight: active ? 700 : 400, cursor: 'pointer', fontSize: 12, color: '#000', transition: 'all 0.15s' }}>
      {children}
    </button>
  )
}

export default function BehorigheterPage() {
  const { people, churches, isPAdmin, isSuperAdmin, isFAdmin, profile, showModal } = useApp()

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
        <p className="page-sub">Sätt roller och detaljerade behörigheter per person</p>
      </div>

      <div className="alert alert-blue" style={{ marginBottom: 20, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <strong>Behörighetsnivåer</strong>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          🌐 <strong>Pastoratsadmin</strong> – allt i hela pastoratet<br />
          🏛 <strong>Församlingsadmin</strong> – allt inom sin kyrka<br />
          👔 <strong>Anställd</strong> – exakt de behörigheter du kryssar i<br />
          👤 <strong>Ideell</strong> – bara sina egna pass och profil
        </div>
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
                const isAdm = ['forsamling','pastorat','super'].includes(p.adminLevel)
                return (
                  <div key={p.id} className="person-row">
                    <div className="person-av" style={{ background: '#7D0037', color: '#fff' }}>{ini}</div>
                    <div className="person-info">
                      <div className="person-name">{p.name}</div>
                      <div className="person-email">{p.mail}</div>
                      <div className="person-tags">
                        <span className="role-tag" style={{ background: rb, color: rc }}>{rl}</span>
                        {isAdm && <span className="role-tag" style={{ background: '#BEE1C8', color: '#00554B', marginLeft: 4 }}>Alla behörigheter</span>}
                      </div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => showModal(<PermModal personId={p.id} />)}>🛡 Ändra</button>
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
