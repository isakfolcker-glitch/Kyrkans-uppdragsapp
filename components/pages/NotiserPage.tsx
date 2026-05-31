'use client'
import { useApp } from '@/lib/appStore'

const typeMap: Record<string, [string, string]> = {
  reminder:  ['ii-green',  '🔔'],
  cancelled: ['ii-red',    '⚠️'],
  new_pass:  ['ii-purple', '📅'],
  message:   ['ii-dark',   '💬'],
}

export default function NotiserPage() {
  const { notifications, u } = useApp()
  const mine = notifications.filter(n => n.userId === u().id)
  const unread = mine.filter(n => !n.read).length
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Notiser</h1>
        <p className="page-sub">{unread ? `${unread} oläst${unread !== 1 ? 'a' : ''}` : 'Allt är läst'}</p>
      </div>
      {mine.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga notiser ännu.</div>
      ) : (
        mine.map(n => {
          const [cls, ico] = typeMap[n.type] ?? ['ii-purple', '🔔']
          return (
            <div key={n.id} className="inbox-item">
              <div className={`inbox-icon ${cls}`}>{ico}</div>
              <div className="inbox-body">
                <div className="inbox-title" style={!n.read ? { fontWeight: 700 } : {}}>{n.title}</div>
                <div className="inbox-sub">{n.body}</div>
                <div className="inbox-time">{n.time}</div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
