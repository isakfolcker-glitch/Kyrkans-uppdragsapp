'use client'
import { useEffect } from 'react'
import { useApp } from '@/lib/appStore'

const typeMap: Record<string, [string, string]> = {
  reminder:          ['ii-green',  '🔔'],
  cancelled:         ['ii-red',    '⚠️'],
  new_pass:          ['ii-purple', '📅'],
  message:           ['ii-dark',   '💬'],
  signup:            ['ii-green',  '✅'],
  waitlist_joined:   ['ii-purple', '⏳'],
  waitlist_promoted: ['ii-green',  '🎉'],
}

export default function NotiserPage() {
  const { notifications, u, currentUser, profile, markAllNotifsRead } = useApp()
  const myId = currentUser ? profile?.id : u().id
  const mine = notifications.filter(n => n.userId === myId)
  const unread = mine.filter(n => !n.read).length

  useEffect(() => {
    if (currentUser && unread > 0) markAllNotifsRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

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
