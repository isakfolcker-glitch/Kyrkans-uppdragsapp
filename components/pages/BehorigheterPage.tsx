'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/appStore'
import { roleLabel } from '@/lib/appData'
import { createClient } from '@/lib/supabase/client'
import type { StaffPerms } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'

const PERM_DEFS: { key: keyof StaffPerms; lbl: string; sub: string; icon: string }[] = [
  { key: 'kan_skapa_pass',         lbl: 'Skapa pass',                icon: 'Calendar', sub: 'Lägga till nya pass i schemat' },
  { key: 'kan_redigera_pass',      lbl: 'Redigera och ställa in pass', icon: 'Pencil', sub: 'Ändra och avboka befintliga pass' },
  { key: 'kan_se_bokningar',       lbl: 'Se bokningar',              icon: 'Eye', sub: 'Visa vilka som är bokade på pass' },
  { key: 'kan_hantera_bokningar',  lbl: 'Hantera bokningar',         icon: 'Bookmark', sub: 'Lägga till och ta bort bokade personer' },
  { key: 'kan_se_personal',        lbl: 'Se personal',               icon: 'Users', sub: 'Visa personallistan' },
  { key: 'kan_lagg_till_personal', lbl: 'Bjuda in ideella',          icon: 'UserPlus', sub: 'Bjuda in ideella och hantera deras grupper' },
  { key: 'kan_hantera_grupper',    lbl: 'Hantera grupper',           icon: 'Tag', sub: 'Skapa och ta bort grupper' },
  { key: 'kan_skicka_utskick',     lbl: 'Skicka utskick',            icon: 'Send', sub: 'Skicka meddelanden till församlingen' },
]

const EMPTY_PERMS: StaffPerms = {
  kan_skapa_pass: false,
  kan_redigera_pass: false,
  kan_se_bokningar: false,
  kan_hantera_bokningar: false,
  kan_se_personal: false,
  kan_lagg_till_personal: false,
  kan_hantera_grupper: false,
  kan_skicka_utskick: false,
}

function PermModal({ personId, churchId }: { personId: any; churchId: number }) {
  const { people, passes, closeModal, isPAdmin, isSuperAdmin, isFAdmin } = useApp()
  const person = people.find(item => item.id === personId && item.church === churchId)
  if (!person) return null

  const [role, setRole] = useState(person.role)
  const [perms, setPerms] = useState<StaffPerms>(EMPTY_PERMS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const myPasses = passes.filter(pass => pass.church === churchId)
  const [responsiblePasses, setResponsiblePasses] = useState<any[]>(
    myPasses.filter(pass => pass.responsibleUserIds.includes(personId)).map(pass => pass.id)
  )

  useEffect(() => {
    createClient()
      .from('profile_church_permissions')
      .select('*')
      .eq('profile_id', personId)
      .eq('church_id', churchId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setPerms({
          kan_skapa_pass: data.kan_skapa_pass,
          kan_redigera_pass: data.kan_redigera_pass,
          kan_se_bokningar: data.kan_se_bokningar,
          kan_hantera_bokningar: data.kan_hantera_bokningar,
          kan_se_personal: data.kan_se_personal,
          kan_lagg_till_personal: data.kan_lagg_till_personal,
          kan_hantera_grupper: data.kan_hantera_grupper,
          kan_skicka_utskick: data.kan_skicka_utskick,
        })
      })
  }, [personId, churchId])

  const togglePass = (id: any) =>
    setResponsiblePasses(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])

  const isEmployee = role !== 'ideell'
  const isAdminRole = ['fadmin', 'padmin', 'superadmin'].includes(role)

  const save = async () => {
    setLoading(true)
    setError('')

    const res = await fetch(`/api/people/${personId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        church_id: churchId,
        role,
        staff_permissions: role === 'anstalld' ? perms : undefined,
        responsible_pass_ids: responsiblePasses,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Kunde inte spara behörigheten.')
      setLoading(false)
      return
    }

    setLoading(false)
    closeModal()
    window.location.reload()
  }

  const ini = person.name.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <h2 className="modal-title">Behörighet <span className="serif">för {person.name}</span></h2>
      <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, marginBottom: 18 }}>
        <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: '#7D0037', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, flexShrink: 0 }}>{ini}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{person.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)' }}>Ändringen gäller bara den valda församlingen.</div>
        </div>
      </div>

      <div className="form-field" role="group" aria-labelledby="roll-rubrik">
        <div id="roll-rubrik" style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Roll i församlingen</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <RoleButton active={role === 'ideell'} onClick={() => setRole('ideell')}><Icon name="User" size={18} />Ideell</RoleButton>
          <RoleButton active={role === 'anstalld'} onClick={() => setRole('anstalld')}><Icon name="UserCheck" size={18} />Anställd</RoleButton>
          {(isFAdmin() || isPAdmin() || isSuperAdmin()) && (
            <RoleButton active={role === 'fadmin'} onClick={() => setRole('fadmin')}><Icon name="BuildingChurch" size={18} />Församlingsadmin</RoleButton>
          )}
          {(isPAdmin() || isSuperAdmin()) && (
            <RoleButton active={role === 'padmin'} onClick={() => setRole('padmin')}><Icon name="World" size={18} />Pastoratsadmin</RoleButton>
          )}
          {role === 'superadmin' && <span>Systemägare · Låst behörighet</span>}
        </div>
      </div>

      {role === 'anstalld' && (
        <fieldset className="form-field" style={{ border: 'none' }}>
          <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Detaljerade behörigheter i denna församling</legend>
          <div className="panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
            {PERM_DEFS.map((def, index) => (
              <label key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', margin: 0, fontWeight: 400, cursor: 'pointer', borderBottom: index < PERM_DEFS.length - 1 ? '1px solid rgba(125,0,55,0.18)' : 'none', background: perms[def.key] ? 'rgba(255,195,170,0.35)' : 'transparent' }}>
                <input type="checkbox" checked={perms[def.key]} onChange={event => setPerms(prev => ({ ...prev, [def.key]: event.target.checked }))} style={{ accentColor: '#7D0037', width: 20, height: 20, minHeight: 0, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: '#000', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={def.icon} size={18} style={{ color: '#7D0037' }} />{def.lbl}</div>
                  <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginTop: 1 }}>{def.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isEmployee && isAdminRole && (
        <div className="alert alert-green"><Icon name="Check" size={18} />Adminrollen ger automatiskt alla behörigheter inom sitt område.</div>
      )}

      {myPasses.length > 0 && (
        <fieldset className="form-field" style={{ border: 'none' }}>
          <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Ansvarig för pass i denna församling</legend>
          <div className="panel" style={{ padding: '4px 14px', maxHeight: 220, overflowY: 'auto', marginBottom: 0 }}>
            {myPasses.map(pass => (
              <label key={pass.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, margin: 0, fontWeight: 400, cursor: 'pointer' }}>
                <input type="checkbox" checked={responsiblePasses.includes(pass.id)} onChange={() => togglePass(pass.id)} style={{ accentColor: '#7D0037', width: 20, height: 20, minHeight: 0 }} />
                <span style={{ fontSize: 15 }}>{pass.title} <span style={{ color: 'rgba(0,0,0,0.72)' }}>({pass.date})</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {error && <div role="alert" className="alert alert-red">{error}</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? 'Sparar...' : 'Spara'}</button>
      </div>
    </>
  )
}

function RoleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: 1, minWidth: 140, minHeight: 44, padding: '0 14px', borderRadius: 999,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        border: `1.5px solid ${active ? '#FFC3AA' : 'rgba(125,0,55,0.35)'}`,
        background: active ? '#FFC3AA' : 'transparent',
        fontWeight: active ? 500 : 400, cursor: 'pointer', fontSize: 14, color: '#000', fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

export default function BehorigheterPage() {
  const { people, churches, currentChurchId, showModal } = useApp()
  const churchId = currentChurchId()
  const church = churches.find(item => item.id === churchId)
  const members = people.filter(person => person.church === churchId)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Behörigheter</h1>
        <p className="page-sub">{church?.name ?? 'Vald församling'} - roller och rättigheter gäller bara här</p>
      </div>

      <div className="alert alert-blue" style={{ marginBottom: 20, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <strong style={{ fontWeight: 500 }}>Behörighet per församling</strong>
        <div style={{ fontSize: 14, lineHeight: 1.6, fontWeight: 400 }}>
          Samma konto kan vara ideell i en församling och anställd eller admin i en annan.
          Detaljerade rättigheter för anställda sparas också separat per församling.
        </div>
      </div>

      {members.length === 0 ? (
        <div className="empty-state panel">
          <div className="empty-state-title">Ingen personal att visa</div>
        </div>
      ) : (
        <div className="panel" style={{ padding: '4px 16px' }}>
          <div className="person-list">
            {members.map(person => {
              const [label, color, background] = roleLabel(person)
              const ini = person.name.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()
              const isAdminRole = ['forsamling', 'pastorat', 'super'].includes(person.adminLevel)
              return (
                <div key={`${person.id}-${person.church}`} className="person-row">
                  <div className="person-av" aria-hidden="true" style={{ background: '#7D0037', color: '#fff' }}>{ini}</div>
                  <div className="person-info">
                    <div className="person-name">{person.name}</div>
                    <div className="person-email">{person.mail}</div>
                    <div className="person-tags">
                      <span className="role-tag" style={{ background, color }}>{label}</span>
                      {isAdminRole && <span className="role-tag" style={{ background: '#FFC3AA', color: '#000', marginLeft: 4 }}>Alla behörigheter</span>}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" disabled={person.adminLevel === 'super'} onClick={() => showModal(<PermModal personId={person.id} churchId={churchId} />)}><Icon name="Shield" size={18} />Ändra<span className="sr-only"> behörighet för {person.name}</span></button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
