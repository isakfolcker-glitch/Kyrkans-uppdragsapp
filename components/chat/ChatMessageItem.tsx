'use client'
// Ett meddelande i konversationen. Redigera och ta bort syns bara på egna meddelanden,
// men det är API:t som avgör om det är tillåtet.
import { useEffect, useId, useRef, useState } from 'react'
import { PersonAvatar } from '@/components/chat/ChatAvatar'
import Icon from '@/components/ui/Icon'
import { formatClock, MAX_BODY_LENGTH, type ChatItem } from '@/lib/chatClient'

interface Props {
  message: ChatItem
  own: boolean
  /** Visa namn och avatar (första meddelandet i en följd). */
  showAuthor: boolean
  onEdit: (id: number, body: string) => Promise<string | null>
  onAskDelete: (id: number) => void
  onRetry: (clientId: string) => void
  onDiscard: (clientId: string) => void
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' })
}

/** Knappen "Försök igen". Väntar ut tiden om servern sagt att man skickar för snabbt. */
function RetryButton({ seconds, onClick }: { seconds: number; onClick: () => void }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={onClick} disabled={left > 0}>
      <Icon name="Refresh" size={16} />
      {left > 0 ? `Försök igen (${left} s)` : 'Försök igen'}
    </button>
  )
}

export default function ChatMessageItem({ message: m, own, showAuthor, onEdit, onAskDelete, onRetry, onDiscard }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const editId = useId()

  useEffect(() => { if (editing) areaRef.current?.focus() }, [editing])

  const deleted = !!m.deletedAt
  const local = m.id <= 0
  const name = m.authorId ? m.authorName : 'Borttagen användare'

  const startEdit = () => { setDraft(m.body); setError(null); setEditing(true) }
  const save = async () => {
    const text = draft.trim()
    if (!text || Array.from(text).length > MAX_BODY_LENGTH) return
    setSaving(true)
    const err = await onEdit(m.id, text)
    setSaving(false)
    if (err) { setError(err); return }
    setEditing(false)
  }

  return (
    <li className={`chat-msg${own ? ' own' : ''}${showAuthor ? ' first' : ''}`}>
      {!own && (showAuthor ? <PersonAvatar ini={m.authorIni} av={m.authorAvColor} ac={m.authorAcColor} /> : <span className="chat-avatar-space" />)}
      <div className="chat-bubble-col">
        {showAuthor && !own && (
          <div className="chat-author">
            <span className="chat-author-name">{name}</span>
            {m.authorIsLeader && <span className="chat-leader-tag">Gruppansvarig</span>}
          </div>
        )}

        {editing ? (
          <div className="chat-bubble editing">
            <label htmlFor={editId} className="sr-only">Ändra meddelandet</label>
            <textarea
              id={editId}
              ref={areaRef}
              rows={3}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(false) } }}
            />
            {error && <div role="alert" className="chat-inline-error">{error}</div>}
            <div className="chat-edit-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Avbryt</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving || !draft.trim() || Array.from(draft.trim()).length > MAX_BODY_LENGTH}>
                {saving ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
        ) : (
          <div className={`chat-bubble${deleted ? ' deleted' : ''}${m.failed ? ' failed' : ''}`}>
            {deleted ? <p className="chat-text">Meddelandet togs bort</p> : <p className="chat-text">{m.body}</p>}
            <div className="chat-foot">
              <time dateTime={m.createdAt} title={fullTime(m.createdAt)}>{formatClock(m.createdAt)}</time>
              {m.editedAt && !deleted && <span>redigerad</span>}
              {m.pending && <span role="status">Skickar...</span>}
            </div>
          </div>
        )}

        {m.failed && (
          <div className="chat-failed" role="alert">
            <span>{m.failed.message}</span>
            <span className="chat-failed-actions">
              {!m.failed.permanent && <RetryButton seconds={m.failed.retryAfter ?? 0} onClick={() => onRetry(m.clientId)} />}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDiscard(m.clientId)}>
                <Icon name="Trash" size={16} />Ta bort
              </button>
            </span>
          </div>
        )}

        {own && !deleted && !local && !editing && (
          <div className="chat-actions">
            <button type="button" className="chat-action" aria-label="Redigera meddelande" onClick={startEdit}>
              <Icon name="Pencil" size={16} />Redigera
            </button>
            <button type="button" className="chat-action" aria-label="Ta bort meddelande" onClick={() => onAskDelete(m.id)}>
              <Icon name="Trash" size={16} />Ta bort
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
