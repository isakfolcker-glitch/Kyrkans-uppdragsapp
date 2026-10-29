'use client'
// Chatt: översikt över gruppchattarna. På dator ligger listan till vänster och samtalet till höger,
// på mobil öppnas samtalet i helskärm.
import { useEffect } from 'react'
import { useChat } from '@/components/chat/ChatProvider'
import ChatList from '@/components/chat/ChatList'
import ChatThread from '@/components/chat/ChatThread'
import Icon from '@/components/ui/Icon'

export default function ChattPage() {
  const { enabled, activeGroupId, closeChat } = useChat()

  // Lämnar du sidan stängs samtalet, så att inget räknas som läst i bakgrunden
  useEffect(() => closeChat, [closeChat])

  if (!enabled) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Chatt</h1></div>
        <div className="empty-state">Chatten är inte tillgänglig just nu.</div>
      </div>
    )
  }

  return (
    <div className="chat-page">
      <div className="page-header">
        <h1 className="page-title">Chatt</h1>
        <p className="page-sub">En chatt för varje grupp du är med i</p>
      </div>
      <div className={`chat-layout${activeGroupId ? ' has-active' : ''}`}>
        <div className="chat-side">
          <ChatList />
        </div>
        <div className="chat-main">
          {activeGroupId ? (
            <ChatThread key={activeGroupId} groupId={activeGroupId} onBack={closeChat} />
          ) : (
            <div className="chat-placeholder">
              <Icon name="Message" size={36} />
              <p>Välj en chatt i listan för att läsa och skriva.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
