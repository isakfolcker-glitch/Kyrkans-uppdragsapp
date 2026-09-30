'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'

const notifDefs = [
  { key: 'passdag',    lbl: 'Påminnelse samma dag',      sub: 'E-post kl 07:00 på uppdragsdagen' },
  { key: 'pamin',     lbl: 'Påminnelse dagen innan',     sub: 'E-post kvällen innan passet' },
  { key: 'instllt',   lbl: 'Inställt pass',              sub: 'E-post om ett bokat pass ställs in' },
  { key: 'nyttpass',  lbl: 'Nya pass i mina grupper',    sub: 'När admin publicerar nytt pass' },
  { key: 'meddelande',lbl: 'Meddelanden från admin',     sub: 'Utskick till din grupp eller alla' },
  { key: 'kommentar_mail', lbl: 'Mail om kommentarer',   sub: 'Mail när någon nämner dig eller svarar på din kommentar. Du får alltid en notis i appen.' },
]

export default function ProfilPage() {
  const { u, updateUserNotif, toggleAvail, profile, currentUser, logout, groups } = useApp()
  const router = useRouter()
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
    if (error) { setSaveMsg('Kunde inte spara: ' + error.message); return }
    setSaveMsg('Sparat.')
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
    if (error) { setPwMsg('Kunde inte byta lösenord: ' + error.message); return }
    setPwMsg('Lösenordet är bytt.')
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
      <div className="profile-header" style={{ flexWrap: 'wrap' }}>
        <div className="profile-av-lg">{displayIni}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 500 }}>{displayName}</div>
          <div style={{ fontSize: 15, marginTop: 3 }}>{displayEmail}</div>
          {profile?.phone && (
            <div style={{ fontSize: 15, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="Phone" size={16} />{profile.phone}</div>
          )}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
            {displayGroups.map((g: string) => (
              <span key={g} className={`tag ${gCls(g, groups)}`}>{gLabel(g, groups)}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <button
            type="button"
            className={`btn ${isAvailable ? 'btn-success' : 'btn-accent'}`}
            style={{ cursor: 'pointer' }}
            aria-pressed={isAvailable}
            onClick={toggleAvail}
          >
            <Icon name={isAvailable ? 'Check' : 'Moon'} size={18} />
            {isAvailable ? 'Tillgänglig' : 'Otillgänglig'}
            <span className="sr-only">, tryck för att ändra</span>
          </button>
          <button
            type="button"
            className="btn btn-on-dark btn-sm"
            onClick={() => {
              setEditName(profile?.name || '')
              setEditPhone(profile?.phone || '')
              setEditEcName(profile?.emergency_contact_name || '')
              setEditEcPhone(profile?.emergency_contact_phone || '')
              setEditOpen(v => !v)
            }}
          >
            <Icon name="Pencil" size={18} />Redigera uppgifter
          </button>
        </div>
      </div>

      {/* Redigera uppgifter */}
      {editOpen && (
        <div className="panel">
          <h2 className="panel-title">Redigera uppgifter</h2>
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
          <div style={{ borderTop: '1px solid rgba(125,0,55,0.18)', paddingTop: 14, marginTop: 4, marginBottom: 14 }}>
            <h3 className="section-label">Kontaktperson i nödsituation</h3>
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
            <div role="status" className={`alert ${saveMsg === 'Sparat.' ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 12 }}>
              {saveMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Avbryt</button>
            <button className="btn btn-primary" onClick={saveProfile}>Spara</button>
          </div>
        </div>
      )}

      {/* Notiser */}
      {notifs && Object.keys(notifs).length > 0 && (
        <>
          <h2 className="section-label">Notiser</h2>
          <div className="panel" style={{ padding: '4px 20px' }}>
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
                  role="switch"
                  aria-checked={!!notifs[n.key]}
                  aria-label={n.lbl}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Byt lösenord */}
      <h2 className="section-label">Byt lösenord</h2>
      <div className="panel">
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
          <div role="status" className={`alert ${pwMsg === 'Lösenordet är bytt.' ? 'alert-green' : 'alert-red'}`} style={{ marginBottom: 12 }}>
            {pwMsg}
          </div>
        )}
        <button className="btn btn-primary" onClick={changePassword}><Icon name="Lock" size={18} />Byt lösenord</button>
      </div>

      {/* GDPR */}
      <GdprSection currentUserId={currentUser?.id} onDeleted={() => { logout(); router.replace('/login') }} />
    </div>
  )
}

function GdprSection({ currentUserId, onDeleted }: { currentUserId?: string; onDeleted: () => void }) {
  const [delConfirm, setDelConfirm] = useState(false)
  const [delLoading, setDelLoading] = useState(false)
  const [delErr, setDelErr]         = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  const exportData = async () => {
    setExportLoading(true)
    const res = await fetch('/api/account/export')
    if (res.ok) {
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `mina-uppgifter-${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
    setExportLoading(false)
  }

  const deleteAccount = async () => {
    setDelLoading(true)
    setDelErr('')
    const res = await fetch('/api/account/delete', { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      setDelErr(d.error ?? 'Något gick fel.')
      setDelLoading(false)
      return
    }
    onDeleted()
  }

  return (
    <>
      <h2 className="section-label" style={{ marginTop: 24 }}>Integritet och GDPR</h2>
      <div className="panel">
        <p style={{ fontSize: 15, color: 'rgba(0,0,0,0.72)', marginBottom: 16, lineHeight: 1.6 }}>
          Enligt GDPR har du rätt att få ut dina uppgifter och att bli raderad ur systemet.
        </p>

        {/* Exportera data */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingBottom: 14, borderBottom: '1px solid rgba(125,0,55,0.18)', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>Exportera mina uppgifter</div>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginTop: 2 }}>Ladda ned allt vi har sparat om dig (JSON)</div>
          </div>
          <button className="btn btn-secondary" onClick={exportData} disabled={exportLoading}>
            <Icon name="Download" size={18} />{exportLoading ? 'Hämtar...' : 'Exportera'}
          </button>
        </div>

        {/* Länk till integritetspolicy */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingBottom: 14, borderBottom: '1px solid rgba(125,0,55,0.18)', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>Integritetspolicy</div>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginTop: 2 }}>Läs om hur vi hanterar dina personuppgifter</div>
          </div>
          <a href="/integritetspolicy" target="_blank" rel="noopener" className="btn btn-secondary">
            Läs<span className="sr-only"> integritetspolicyn (öppnas i ny flik)</span><Icon name="ExternalLink" size={18} />
          </a>
        </div>

        {/* Radera konto */}
        {!delConfirm ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#7D0037' }}>Radera mitt konto</div>
              <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginTop: 2 }}>Tar bort all din data permanent</div>
            </div>
            <button className="btn btn-danger" onClick={() => setDelConfirm(true)}><Icon name="Trash" size={18} />Radera</button>
          </div>
        ) : (
          <div role="alert" style={{ background: '#FFC3AA', border: '1px solid #FF785A', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#7D0037', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="Alert" size={18} />Är du helt säker?</div>
            <p style={{ fontSize: 15, color: '#000', marginBottom: 14 }}>
              Ditt konto, alla bokningar och personuppgifter raderas permanent. Det går inte att ångra.
            </p>
            {delErr && <div className="alert alert-red" style={{ marginBottom: 10 }}>{delErr}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setDelConfirm(false)}>Avbryt</button>
              <button className="btn btn-danger" onClick={deleteAccount} disabled={delLoading}>
                <Icon name="Trash" size={18} />{delLoading ? 'Raderar...' : 'Ja, radera mitt konto'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
