'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/appStore'
import { roleLabel } from '@/lib/appData'
import { createClient } from '@/lib/supabase/client'
import type { StaffPerms } from '@/lib/appStore'

const PERM_DEFS: { key: keyof StaffPerms; lbl: string; sub: string; icon: string }[] = [
  { key: 'kan_skapa_pass',         lbl: 'Skapa pass',                icon: '📅', sub: 'Lägga till nya pass i schemat' },
  { key: 'kan_redigera_pass',      lbl: 'Redigera och ställa in pass', icon: '✏️', sub: 'Ändra och avboka befintliga pass' },
  { key: 'kan_se_bokningar',       lbl: 'Se bokningar',              icon: '👁', sub: 'Visa vilka som är bokade på pass' },
  { key: 'kan_hantera_bokningar',  lbl: 'Hantera bokningar',         icon: '📋', sub: 'Lägga till och ta bort bokade personer' },
  { key: 'kan_se_personal',        lbl: 'Se personal',               icon: '👥', sub: 'Visa personallistan' },
  { key: 'kan_lagg_till_personal', lbl: 'Bjuda in ideella',          icon: '➕', sub: 'Bjuda in ideella och hantera deras grupper' },
  { key: 'kan_hantera_grupper',    lbl: 'Hantera grupper',           icon: '🏷', sub: 'Skapa och ta bort grupper' },
  { key: 'kan_skicka_utskick',     lbl: 'Skicka utskick',            icon: '✉️', sub: 'Skicka meddelanden till församlingen' },
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
      <div className="modal-title">🛡 Behörighet - {person.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#FFEBE1', borderRadius: 12, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#7D0037', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{ini}</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{person.name}</div>
          <div style={{ fontSize: 12, color: '#5F5E5A' }}>Ändringen gäller bara den valda församlingen.</div>
        </div>
      </div>

      <div className="form-field">
        <label>Roll i församlingen</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <RoleButton active={role === 'ideell'} onClick={() => setRole('ideell')}>👤 Ideell</RoleButton>
          <RoleButton active={role === 'anstalld'} onClick={() => setRole('anstalld')}>👔 Anställd</RoleButton>
          {(isFAdmin() || isPAdmin() || isSuperAdmin()) && (
            <RoleButton active={role === 'fadmin'} onClick={() => setRole('fadmin')}>🏛 Församlingsadmin</RoleButton>
          )}
          {(isPAdmin() || isSuperAdmin()) && (
            <RoleButton active={role === 'padmin'} onClick={() => setRole('padmin')}>🌐 Pastoratsadmin</RoleButton>
          )}
          {isSuperAdmin() && (
            <RoleButton active={role === 'superadmin'} onClick={() => setRole('superadmin')}>⚙ Systemadmin</RoleButton>
          )}
        </div>
      </div>

      {role === 'anstalld' && (
        <div className="form-field">
          <label>Detaljerade behörigheter i denna församling</label>
          <div style={{ background: '#FFEBE1', borderRadius: 12, border: '1px solid rgba(125,0,55,0.1)', overflow: 'hidden' }}>
            {PERM_DEFS.map((def, index) => (
              <label key={def.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer', borderBottom: index < PERM_DEFS.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', background: perms[def.key] ? 'rgba(125,0,55,0.04)' : 'transparent' }}>
                <input type="checkbox" checked={perms[def.key]} onChange={event => setPerms(prev => ({ ...prev, [def.key]: event.target.checked }))} style={{ accentColor: '#7D0037', width: 16, height: 16, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>{def.icon} {def.lbl}</div>
                  <div style={{ fontSize: 11, color: '#5F5E5A', marginTop: 1 }}>{def.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {isEmployee && isAdminRole && (
        <div className="alert alert-green">✓ Adminrollen ger automatiskt alla behörigheter inom sitt område.</div>
      )}

      {myPasses.length > 0 && (
        <div className="form-field">
          <label>Ansvarig för pass i denna församling</label>
          <div style={{ background: '#FFEBE1', borderRadius: 10, padding: 12, maxHeight: 180, overflowY: 'auto' }}>
            {myPasses.map(pass => (
              <label key={pass.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={responsiblePasses.includes(pass.id)} onChange={() => togglePass(pass.id)} style={{ accentColor: '#7D0037', width: 15, height: 15 }} />
                <span style={{ fontSize: 13 }}>{pass.title} <span style={{ color: '#BC8E4C' }}>({pass.date})</span></span>
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
    </>
  )
}

function RoleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, minWidth: 120, padding: '9px 12px', borderRadius: 10,
        border: `1.5px solid ${active ? '#7D0037' : 'rgba(0,0,0,0.12)'}`,
        background: active ? '#FFEBE1' : '#fff',
        fontWeight: active ? 700 : 400, cursor: 'pointer', fontSize: 12, color: '#000',
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
        <strong>Behörighet per församling</strong>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
          Samma konto kan vara ideell i en församling och anställd eller admin i en annan.
          Detaljerade rättigheter för anställda sparas också separat per församling.
        </div>
      </div>

      {members.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid rgba(125,0,55,0.08)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#000' }}>Ingen personal att visa</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid rgba(125,0,55,0.08)', borderRadius: 16, padding: '4px 16px' }}>
          <div className="person-list">
            {members.map(person => {
              const [label, color, background] = roleLabel(person)
              const ini = person.name.split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()
              const isAdminRole = ['forsamling', 'pastorat', 'super'].includes(person.adminLevel)
              return (
                <div key={`${person.id}-${person.church}`} className="person-row">
                  <div className="person-av" style={{ background: '#7D0037', color: '#fff' }}>{ini}</div>
                  <div className="person-info">
                    <div className="person-name">{person.name}</div>
                    <div className="person-email">{person.mail}</div>
                    <div className="person-tags">
                      <span className="role-tag" style={{ background, color }}>{label}</span>
                      {isAdminRole && <span className="role-tag" style={{ background: '#BEE1C8', color: '#00554B', marginLeft: 4 }}>Alla behörigheter</span>}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => showModal(<PermModal personId={person.id} churchId={churchId} />)}>🛡 Ändra</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
