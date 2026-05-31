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
  const { u, updateUserNotif, toggleAvail } = useApp()
  const usr = u()
  const notifs = usr.notifs

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Min profil</h1></div>
      <div className="profile-header">
        <div className="profile-av-lg" style={{ background: usr.av, color: usr.ac }}>{usr.ini}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#2C2C2A' }}>{usr.name}</div>
          <div style={{ fontSize: 13, color: '#888780', marginTop: 2 }}>{usr.email}</div>
          <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
            {usr.groups.map(g => <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>)}
          </div>
        </div>
        <button className={`btn ${usr.available ? 'btn-success' : 'btn-danger'}`} style={{ cursor: 'pointer' }} onClick={toggleAvail}>
          {usr.available ? 'Tillgänglig' : 'Otillgänglig'}
        </button>
      </div>

      {Object.keys(notifs).length > 0 && (
        <>
          <div className="section-label">Notiser</div>
          <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            {notifDefs.filter(n => notifs[n.key] !== undefined).map(n => (
              <div key={n.key} className="toggle-row">
                <div className="toggle-info">
                  <div className="toggle-lbl">{n.lbl}</div>
                  <div className="toggle-sub">{n.sub}</div>
                </div>
                <button className={`toggle-switch${notifs[n.key] ? ' on' : ''}`} onClick={() => updateUserNotif(n.key, !notifs[n.key])} />
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
