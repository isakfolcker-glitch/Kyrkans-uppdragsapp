'use client'
import { useApp } from '@/lib/appStore'
import PassQAModal from '@/components/modals/PassQAModal'
import Icon from '@/components/ui/Icon'

// Notistyper som öppnar passets kommentarstråd.
const THREAD_TYPES = new Set(['message', 'comment', 'comment_reply', 'comment_mention'])

// Färgklass och Tabler-ikon per notistyp.
const typeMap: Record<string, [string, string]> = {
  reminder:          ['ii-green',  'Bell'],
  cancelled:         ['ii-red',    'Alert'],
  new_pass:          ['ii-purple', 'Calendar'],
  message:           ['ii-dark',   'Message'],
  comment:           ['ii-dark',   'Message'],
  comment_reply:     ['ii-dark',   'Reply'],
  comment_mention:   ['ii-purple', 'At'],
  signup:            ['ii-green',  'Check'],
  waitlist_joined:   ['ii-purple', 'Hourglass'],
  waitlist_promoted: ['ii-green',  'CircleCheck'],
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
        <div className="empty-state">Inga notiser ännu.</div>
      ) : (
        mine.map(notification => {
          const [cls, icon] = typeMap[notification.type] ?? ['ii-purple', 'Bell']
          const clickable = Boolean(notification.passId)

          return (
            <button
              key={notification.id}
              type="button"
              className={`inbox-item${notification.read ? "" : " unread"}`}
              onClick={() => openNotification(notification)}
              disabled={!clickable}
              aria-label={clickable ? `Öppna notis: ${notification.title}` : undefined}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                cursor: clickable ? 'pointer' : 'default',
                fontFamily: 'inherit',

              }}
            >
              <div className={`inbox-icon ${cls}`}><Icon name={icon} /></div>
              <div className="inbox-body">
                <div className="inbox-title">
                  {notification.title}
                  {!notification.read && <span className="sr-only"> (oläst)</span>}
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
