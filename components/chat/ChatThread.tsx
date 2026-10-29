'use client'
// En gruppchatt: huvud, meddelanden och meddelandefält.
// - På mobil fyller den hela skärmen (fast ovanpå menyn). Höjden följer synliga delen av
//   skärmen, så att meddelandefältet ligger ovanför tangentbordet.
// - Rullar bara ned automatiskt om du redan är längst ned.
// - Markerar som läst först när chatten syns och du är längst ned.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { useApp } from '@/lib/appStore'
import { useChat } from '@/components/chat/ChatProvider'
import ChatComposer from '@/components/chat/ChatComposer'
import ChatMessageItem from '@/components/chat/ChatMessageItem'
import ChatPrivacyNote from '@/components/chat/ChatPrivacyNote'
import { GroupAvatar } from '@/components/chat/ChatAvatar'
import ConfirmModal from '@/components/modals/ConfirmModal'
import Icon from '@/components/ui/Icon'
import { formatDayLabel, isNearBottom, sameDay, shouldShowAuthor, lastRealId } from '@/lib/chatClient'

// Synliga delen av skärmen (utan tangentbord). Ger "höjd|överkant" som text så att den är stabil.
function subscribeViewport(onChange: () => void) {
  const vv = window.visualViewport
  vv?.addEventListener('resize', onChange)
  vv?.addEventListener('scroll', onChange)
  return () => { vv?.removeEventListener('resize', onChange); vv?.removeEventListener('scroll', onChange) }
}
const viewportSnapshot = () => {
  const vv = window.visualViewport
  return vv ? `${Math.round(vv.height)}|${Math.round(vv.offsetTop)}` : ''
}

interface Props {
  groupId: string
  /** Visas på mobil. På dator ligger listan bredvid. */
  onBack: () => void
}

export default function ChatThread({ groupId, onBack }: Props) {
  const { showModal } = useApp()
  const chat = useChat()
  const { chats, meId, overviewStatus, reloadThread, loadOlder, send, retry, discard, edit, remove, reportViewing, markRead } = chat
  const summary = chats.find(c => c.groupId === groupId)
  const thread = chat.thread(groupId)
  const { messages, loaded, loading, loadingOlder, hasMore, error } = thread

  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const snap = useRef<{ first: number | null; last: string | null; height: number } | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [newBelow, setNewBelow] = useState(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const [actionError, setActionError] = useState<string | null>(null)

  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => '')
  const [vh, vtop] = viewport ? viewport.split('|').map(Number) : [0, 0]
  const style = (vh ? { '--chat-h': `${vh}px`, '--chat-top': `${vtop}px` } : undefined) as CSSProperties | undefined

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // Nya meddelanden: rulla ned bara om du redan är längst ned (eller själv skickat).
  // Äldre meddelanden som läggs överst får inte flytta det du läser.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const first = messages.find(m => m.id > 0)?.id ?? null
    const lastItem = messages[messages.length - 1]
    const last = lastItem ? `${lastItem.id}|${lastItem.clientId}` : null
    const prev = snap.current
    snap.current = { first, last, height: el.scrollHeight }
    if (!prev) { if (messages.length) scrollToBottom(); return }
    if (first !== prev.first && last === prev.last) {
      el.scrollTop += el.scrollHeight - prev.height
    } else if (last !== prev.last) {
      if (stick.current || lastItem?.authorId === meId && lastItem.id <= 0) scrollToBottom()
      else setNewBelow(true)
    }
  }, [messages, meId, scrollToBottom])

  // Tangentbordet öppnas eller stängs: håll kvar botten om du var där
  useEffect(() => { if (stick.current) scrollToBottom() }, [vh, scrollToBottom])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const near = isNearBottom(el)
    stick.current = near
    setAtBottom(near)
    if (near) setNewBelow(false)
    if (el.scrollTop < 60 && hasMore && !loadingOlder) loadOlder(groupId)
  }

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Läsmarkering: chatten syns, du är längst ned och sidan är i förgrunden
  const lastId = lastRealId(messages)
  useEffect(() => {
    if (!loaded || !visible || !atBottom) { reportViewing(null); return }
    reportViewing(groupId)
    if (lastId !== null) markRead(groupId)
  }, [loaded, visible, atBottom, lastId, groupId, reportViewing, markRead])
  useEffect(() => () => reportViewing(null), [reportViewing])

  const askDelete = (id: number) => showModal(
    <ConfirmModal
      icon="Trash"
      title="Ta bort meddelandet?"
      sub="Alla i gruppen ser då att meddelandet togs bort. Det går inte att ångra."
      confirmLabel="Ta bort"
      onConfirm={async () => {
        const err = await remove(groupId, id)
        setActionError(err)
      }}
    />,
  )

  const jumpDown = () => { scrollToBottom(); stick.current = true; setAtBottom(true); setNewBelow(false) }

  if (overviewStatus === 'ready' && !summary) {
    return (
      <section className="chat-thread" style={style} aria-label="Chatt">
        <div className="chat-thread-head">
          <button type="button" className="chat-back" aria-label="Tillbaka till chattarna" onClick={onBack}><Icon name="ArrowLeft" /></button>
          <h2 className="chat-thread-title">Chatten finns inte</h2>
        </div>
        <div className="chat-thread-empty">Du är inte med i den här chatten, eller så har gruppen tagits bort.</div>
      </section>
    )
  }

  const archived = summary?.archived ?? false

  return (
    <section className="chat-thread" style={style} aria-label={`Chatt: ${summary?.label ?? ''}`}>
      <div className="chat-thread-head">
        <button type="button" className="chat-back" aria-label="Tillbaka till chattarna" onClick={onBack}>
          <Icon name="ArrowLeft" />
        </button>
        <GroupAvatar size={40} />
        <div className="chat-thread-heading">
          <h2 className="chat-thread-title">{summary?.label ?? 'Chatt'}</h2>
          {summary && <span className="chat-thread-sub">{summary.churchName ?? 'Gemensam grupp'}</span>}
        </div>
      </div>
      <ChatPrivacyNote className="chat-privacy-head" />

      <div className="chat-scroll-wrap">
        <div ref={scrollRef} className="chat-scroll" onScroll={onScroll} tabIndex={0} role="log" aria-label="Meddelanden" aria-relevant="additions">
          {!loaded && loading && <p className="chat-note" role="status">Hämtar meddelanden...</p>}
          {!loaded && error && (
            <div className="chat-note">
              <div role="alert" className="alert alert-red"><Icon name="Alert" size={18} />{error}</div>
              <button type="button" className="btn btn-primary" onClick={() => reloadThread(groupId)}><Icon name="Refresh" size={18} />Försök igen</button>
            </div>
          )}
          {loaded && (
            <>
              {hasMore ? (
                <div className="chat-note">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadOlder(groupId)} disabled={loadingOlder}>
                    {loadingOlder ? 'Hämtar...' : 'Visa äldre meddelanden'}
                  </button>
                </div>
              ) : (
                <p className="chat-note chat-start">{messages.length ? 'Början av chatten' : 'Inga meddelanden än. Skriv det första!'}</p>
              )}
              {error && (
                <div className="chat-note">
                  <div role="alert" className="alert alert-red"><Icon name="Alert" size={18} />{error}</div>
                </div>
              )}
              <ul className="chat-messages">
                {messages.map((m, i) => {
                  const prev = messages[i - 1]
                  const newDay = !prev || !sameDay(prev.createdAt, m.createdAt)
                  return (
                    <ChatRow key={m.clientId + (m.id > 0 ? '' : '-local')} day={newDay ? formatDayLabel(m.createdAt) : null}>
                      <ChatMessageItem
                        message={m}
                        own={m.authorId !== null && m.authorId === meId}
                        showAuthor={shouldShowAuthor(prev, m)}
                        onEdit={(id, body) => edit(groupId, id, body)}
                        onAskDelete={askDelete}
                        onRetry={clientId => retry(groupId, clientId)}
                        onDiscard={clientId => discard(groupId, clientId)}
                      />
                    </ChatRow>
                  )
                })}
              </ul>
            </>
          )}
        </div>
        {newBelow && (
          <button type="button" className="chat-jump btn btn-primary btn-sm" onClick={jumpDown}>
            <Icon name="ChevronDown" size={18} />Nya meddelanden
          </button>
        )}
      </div>

      {actionError && (
        <div role="alert" className="alert alert-red chat-action-error">
          <Icon name="Alert" size={18} />{actionError}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActionError(null)}>Stäng</button>
        </div>
      )}

      {archived ? (
        <p className="chat-archived">Den här chatten är arkiverad. Du kan läsa tidigare meddelanden men inte skriva nya.</p>
      ) : (
        <ChatComposer onSend={body => { void send(groupId, body) }} />
      )}
    </section>
  )
}

/** Listpost med en dagsrubrik före sig när dagen byts. */
function ChatRow({ day, children }: { day: string | null; children: React.ReactNode }) {
  if (!day) return <>{children}</>
  return (
    <>
      <li className="chat-day" aria-hidden="false"><span>{day}</span></li>
      {children}
    </>
  )
}
