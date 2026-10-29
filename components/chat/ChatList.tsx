'use client'
// Chattöversikten: en rad per grupp, senaste aktivitet överst. Sök på gruppnamn och filter "Olästa".
import { useId, useMemo, useState } from 'react'
import { useChat } from '@/components/chat/ChatProvider'
import { GroupAvatar } from '@/components/chat/ChatAvatar'
import Icon from '@/components/ui/Icon'
import { filterChats, formatListTime, formatUnread, previewLine } from '@/lib/chatClient'

export default function ChatList() {
  const { chats, meId, overviewStatus, reloadOverview, activeGroupId, openChat } = useChat()
  const [query, setQuery] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const searchId = useId()

  const visible = useMemo(() => filterChats(chats, query, onlyUnread), [chats, query, onlyUnread])
  // Visa församlingens namn bara när det behövs för att skilja chattarna åt
  const showChurch = new Set(chats.map(c => c.churchName)).size > 1

  if (overviewStatus === 'loading' || overviewStatus === 'idle') {
    return <div className="chat-list-empty" role="status">Hämtar chattar...</div>
  }
  if (overviewStatus === 'error') {
    return (
      <div className="chat-list-empty">
        <div role="alert" className="alert alert-red"><Icon name="Alert" size={18} />Kunde inte hämta chattarna.</div>
        <button type="button" className="btn btn-primary" onClick={reloadOverview}><Icon name="Refresh" size={18} />Försök igen</button>
      </div>
    )
  }
  if (chats.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Du är inte med i någon gruppchatt än</div>
        Varje grupp har en egen chatt. Be en admin lägga till dig i en grupp, så dyker chatten upp här.
      </div>
    )
  }

  return (
    <div className="chat-list">
      <div className="chat-list-tools">
        <div className="chat-search">
          <label htmlFor={searchId} className="sr-only">Sök bland dina chattar</label>
          <Icon name="Search" size={18} className="chat-search-icon" />
          <input
            id={searchId}
            type="search"
            placeholder="Sök grupp"
            value={query}
            onChange={event => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className={`chat-filter${onlyUnread ? ' on' : ''}`}
          aria-pressed={onlyUnread}
          onClick={() => setOnlyUnread(v => !v)}
        >
          Olästa
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="chat-list-empty" role="status">
          {onlyUnread && !query.trim() ? 'Inga olästa meddelanden. Bra jobbat!' : 'Ingen chatt matchar sökningen.'}
        </p>
      ) : (
        <ul className="chat-rows">
          {visible.map(chat => {
            const active = chat.groupId === activeGroupId
            return (
              <li key={chat.groupId}>
                <button
                  type="button"
                  className={`chat-row${active ? ' active' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => openChat(chat.groupId)}
                >
                  <GroupAvatar />
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <span className="chat-row-name">{chat.label}</span>
                      <span className="chat-row-time">{formatListTime(chat.lastActivityAt)}</span>
                    </span>
                    {showChurch && <span className="chat-row-church">{chat.churchName ?? 'Gemensam grupp'}</span>}
                    <span className="chat-row-bottom">
                      <span className={`chat-row-preview${chat.unreadCount > 0 ? ' unread' : ''}`}>{previewLine(chat, meId)}</span>
                      {chat.unreadCount > 0 && (
                        <span className="chat-badge">
                          <span aria-hidden="true">{formatUnread(chat.unreadCount)}</span>
                          <span className="sr-only">{chat.unreadCount > 99 ? 'Över 99 olästa' : `${chat.unreadCount} olästa`}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
