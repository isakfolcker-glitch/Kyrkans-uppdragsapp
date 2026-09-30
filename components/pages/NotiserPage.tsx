'use client'
import { useApp } from '@/lib/appStore'
import PassQAModal from '@/components/modals/PassQAModal'

// Notistyper som öppnar passets kommentarstråd.
const THREAD_TYPES = new Set(['message', 'comment', 'comment_reply', 'comment_mention'])

const typeMap: Record<string, [string, string]> = {
  reminder:          ['ii-green',  '🔔'],
  cancelled:         ['ii-red',    '⚠️'],
  new_pass:          ['ii-purple', '📅'],
  message:           ['ii-dark',   '💬'],
  comment:           ['ii-dark',   '💬'],
  comment_reply:     ['ii-dark',   '↩️'],
  comment_mention:   ['ii-purple', '@'],
  signup:            ['ii-green',  '✅'],
  waitlist_joined:   ['ii-purple', '⏳'],
  waitlist_promoted: ['ii-green',  '🎉'],
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('sv-SE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotiserPage() {
  const {
    notifications, u, currentUser, profile, passes, churches,
    markNotifRead, markAllNotifsRead, setChurch, showModal, goTo,
  } = useApp()

  const myId = currentUser ? profile?.id : u().id
  const mine = notifications.filter(notification => notification.userId === myId)
  const unread = mine.filter(notification => !notification.read).length

  const openNotification = (notification: (typeof mine)[number]) => {
    if (!notification.read) markNotifRead(Number(notification.id))

    if (!notification.passId) return

    const pass = passes.find(item => item.id === notification.passId)
    if (pass) {
      const churchIndex = churches.findIndex(church => church.id === pass.church)
      if (churchIndex >= 0) setChurch(churchIndex)
    }

    if (THREAD_TYPES.has(notification.type)) {
      if (pass) {
        showModal(
          <PassQAModal
            passId={notification.passId}
            targetCommentId={notification.commentId}
          />
        )
      } else {
        goTo('pass')
      }
      return
    }

    goTo('pass')
  }

  return (
    <div>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}
      >
        <div>
          <h1 className="page-title">Notiser</h1>
          <p className="page-sub">{unread ? `${unread} oläst${unread !== 1 ? 'a' : ''}` : 'Allt är läst'}</p>
        </div>
        {unread > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={markAllNotifsRead}>
            Markera alla som lästa
          </button>
        )}
      </div>

      {mine.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga notiser ännu.</div>
      ) : (
        mine.map(notification => {
          const [cls, icon] = typeMap[notification.type] ?? ['ii-purple', '🔔']
          const clickable = Boolean(notification.passId)

          return (
            <button
              key={notification.id}
              type="button"
              className="inbox-item"
              onClick={() => openNotification(notification)}
              disabled={!clickable}
              aria-label={clickable ? `Öppna notis: ${notification.title}` : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit',
                opacity: notification.read ? 0.86 : 1,
              }}
            >
              <div className={`inbox-icon ${cls}`}>{icon}</div>
              <div className="inbox-body">
                <div className="inbox-title" style={!notification.read ? { fontWeight: 700 } : {}}>
                  {notification.title}
                </div>
                <div className="inbox-sub">{notification.body}</div>
                <div className="inbox-time">
                  {formatTime(notification.time)}
                  {THREAD_TYPES.has(notification.type) && notification.passId ? ' · Öppna tråden' : ''}
                </div>
              </div>
            </button>
          )
        })
      )}
    </div>
  )
}
