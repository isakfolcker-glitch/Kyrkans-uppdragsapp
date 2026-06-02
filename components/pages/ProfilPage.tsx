'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'
import { createClient } from '@/lib/supabase/client'

const notifDefs = [
  { key: 'passdag',    lbl: 'Påminnelse samma dag',      sub: 'E-post kl 07:00 på uppdragsdagen' },
  { key: 'pamin',     lbl: 'Påminnelse dagen innan',     sub: 'E-post kvällen innan passet' },
  { key: 'instllt',   lbl: 'Inställt pass',              sub: 'E-post om ett bokat pass ställs in' },
  { key: 'nyttpass',  lbl: 'Nya pass i mina grupper',    sub: 'När admin publicerar nytt pass' },
  { key: 'meddelande',lbl: 'Meddelanden från admin',     sub: 'Utskick till din grupp eller alla' },
]

export default function ProfilPage() {
  const { u, updateUserNotif, toggleAvail, profile, currentUser } = useApp()
  const usr = u()

  const displayName   = profile?.name  || usr.name
  const displayEmail  = currentUser?.email || usr.email
  const displayIni    = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const displayGroups = profile?.profile_groups?.map((g: any) => g.group_id) || usr.groups
  const isAvailable   = profile?.available ?? usr.available
  const notifs        = profile?.notif_settings?.[0] ?? usr.notifs

  // Redigera profil
  const [editOpen, setEditOpen]   = useState(false)
  const [editName, setEditName]   = useState(profile?.name || '')
  const [editPhone, setEditPhone] = useState(profile?.phone || '')
  const [editEcName, setEditEcName]   = useState(profile?.emergency_contact_name || '')
  const [editEcPhone, setEditEcPhone] = useState(profile?.emergency_contact_phone || '')
  const [saveMsg, setSaveMsg] = useState('')

  const saveProfile = async () => {
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({
      name: editName,
      phone: editPhone,
      emergency_contact_name: editEcName,
      emergency_contact_phone: editEcPhone,
    }).eq('id', currentUser?.id)
    if (error) { setSaveMsg('❌ ' + error.message); return }
    setSaveMsg('✓ Sparad!')
    setTimeout(() => { setSaveMsg(''); setEditOpen(false) }, 1500)
  }

  // Byt lösenord
  const [pw, setPw]   = useState('')
  const [pw2, setPw2] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  const changePassword = async () => {
    if (pw.length < 8) { setPwMsg('Minst 8 tecken.'); return }
    if (pw !== pw2)    { setPwMsg('Lösenorden matchar inte.'); return }
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setPwMsg('❌ ' + error.message); return }
    setPwMsg('✓ Lösenord bytt!')
    setPw(''); setPw2('')
    setTimeout(() => setPwMsg(''), 2000)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Min profil</h1>
        <p className="page-sub">Hantera dina uppgifter och inställningar</p>
      </div>

      {/* Profilhuvud */}
      <div className="profile-header" style={{ color: '#fff' }}>
        <div className="profile-av-lg">{displayIni}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{displayName}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>{displayEmail}</div>
          {profile?.phone && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>📱 {profile.phone}</div>
          )}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {displayGroups.map((g: string) => (
              <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <button
            className={`btn ${isAvailable ? 'btn-success' : 'btn-danger'}`}
            onClick={toggleAvail}
          >
            {isAvailable ? '✓ Tillgänglig' : '✗ Otillgänglig'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setEditName(profile?.name || '')
              setEditPhone(profile?.phone || '')
              setEditEcName(profile?.emergency_contact_name || '')
              setEditEcPhone(profile?.emergency_contact_phone || '')
              setEditOpen(v => !v)
            }}
          >
            ✏️ Redigera uppgifter
          </button>
        </div>
      </div>

      {/* Redigera uppgifter */}
      {editOpen && (
        <div style={{ background: '#fff', border: '1px solid rgba(125,0,55,0.1)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#000', marginBottom: 16 }}>Redigera uppgifter</div>
          <div className="form-row">
            <div className="form-field">
              <label>Namn</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Mobilnummer</label>
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="070-..." />
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 14, marginTop: 4, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7D0037', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Kontaktperson i nödsituation
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Namn</label>
                <input value={editEcName} onChange={e => setEditEcName(e.target.value)} placeholder="Anna Andersson" />
              </div>
              <div className="form-field">
                <label>Telefonnummer</label>
                <input value={editEcPhone} onChange={e => setEditEcPhone(e.target.value)} placeholder="070-..." />
              </div>
            </div>
          </div>
          {saveMsg && (
            <div className={`alert ${saveMsg.startsWith('✓') ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 12 }}>
              {saveMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Avbryt</button>
            <button className="btn btn-primary" onClick={saveProfile}>✓ Spara</button>
          </div>
        </div>
      )}

      {/* Notiser */}
      {notifs && Object.keys(notifs).length > 0 && (
        <>
          <div className="section-label">Notiser</div>
          <div style={{ background: '#fff', border: '1px solid rgba(125,0,55,0.1)', borderRadius: 16, padding: '4px 16px', marginBottom: 16 }}>
            {notifDefs.filter(n => notifs[n.key] !== undefined).map(n => (
              <div key={n.key} className="toggle-row">
                <div className="toggle-info">
                  <div className="toggle-lbl">{n.lbl}</div>
                  <div className="toggle-sub">{n.sub}</div>
                </div>
                <button
                  className={`toggle-switch${notifs[n.key] ? ' on' : ''}`}
                  onClick={() => updateUserNotif(n.key, !notifs[n.key])}
                  type="button"
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Byt lösenord */}
      <div className="section-label">Byt lösenord</div>
      <div style={{ background: '#fff', border: '1px solid rgba(125,0,55,0.1)', borderRadius: 16, padding: 20 }}>
        <div className="form-row">
          <div className="form-field">
            <label>Nytt lösenord</label>
            <input type="password" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="form-field">
            <label>Upprepa lösenord</label>
            <input type="password" placeholder="••••••••" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {pwMsg && (
          <div className={`alert ${pwMsg.startsWith('✓') ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 12 }}>
            {pwMsg}
          </div>
        )}
        <button className="btn btn-primary" onClick={changePassword}>🔒 Byt lösenord</button>
      </div>
    </div>
  )
}
