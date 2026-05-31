'use client'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'

const notifDefs = [
  {key:'passdag',lbl:'Påminnelse samma dag',sub:'E-post kl 07:00 på uppdragsdagen'},
  {key:'pamin',lbl:'Påminnelse dagen innan',sub:'E-post kvällen innan passet'},
  {key:'instllt',lbl:'Inställt pass',sub:'E-post om ett bokat pass ställs in'},
  {key:'nyttpass',lbl:'Nya pass i mina grupper',sub:'När admin publicerar nytt pass'},
  {key:'meddelande',lbl:'Meddelanden från admin',sub:'Utskick till din grupp eller alla'},
]

export default function ProfilPage() {
  const { u, updateUserNotif, toggleAvail, profile, currentUser } = useApp()
  const usr = u()
  // Använd riktig profil om inloggad
  const displayName = profile?.name || usr.name
  const displayEmail = currentUser?.email || usr.email
  const displayIni = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const displayGroups = profile?.profile_groups?.map((g: any) => g.group_id) || usr.groups
  const isAvailable = profile?.available ?? usr.available
  const notifs = profile?.notif_settings?.[0] ?? usr.notifs
  const notifs = usr.notifs

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Min profil</h1></div>
      <div className="profile-header">
        <div className="profile-av-lg" style={{ background: '#EEEDFE', color: '#3C3489' }}>{displayIni}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#2C2C2A' }}>{displayName}</div>
          <div style={{ fontSize: 13, color: '#888780', marginTop: 2 }}>{displayEmail}</div>
          <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
            {displayGroups.map((g: string) => <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>)}
          </div>
        </div>
        <button className={`btn ${isAvailable ? 'btn-success' : 'btn-danger'}`} style={{ cursor: 'pointer' }} onClick={toggleAvail}>
          {isAvailable ? 'Tillgänglig' : 'Otillgänglig'}
        </button>
      </div>

      {notifs && Object.keys(notifs).length > 0 && (
        <>
          <div className="section-label">Notiser</div>
          <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            {notifDefs.filter(n => notifs[n.key] !== undefined).map(n => (
              <div key={n.key} className="toggle-row">
                <div className="toggle-info">
                  <div className="toggle-lbl">{n.lbl}</div>
                  <div className="toggle-sub">{n.sub}</div>
                </div>
                <button className={`toggle-switch${notifs[n.key] ? ' on' : ''}`} onClick={() => updateUserNotif(n.key, !notifs[n.key])} type="button" />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Byt lösenord</div>
      <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: 16 }}>
        <div className="form-field"><label>Nuvarande lösenord</label><input type="password" placeholder="••••••••" /></div>
        <div className="form-field"><label>Nytt lösenord</label><input type="password" placeholder="••••••••" /></div>
        <div className="form-field"><label>Upprepa</label><input type="password" placeholder="••••••••" /></div>
        <button className="btn btn-primary">🔒 Byt lösenord</button>
      </div>
    </div>
  )
}
