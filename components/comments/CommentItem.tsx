'use client'
// En kommentar med sina svar. Texten renderas som vanlig text (aldrig HTML).
// Knapparna visas bara för den som får använda dem, men API:t och databasen
// bestämmer alltid på riktigt.
import { useEffect, useRef, useState } from 'react'
import { IconArrowBackUp, IconPencil, IconTrash } from '@tabler/icons-react'
import type { CommentParticipant, PassMessage } from '@/types'
import { splitMentions } from '@/lib/comments/mentions'
import CommentComposer from './CommentComposer'
import { StaffBadge } from './MentionPicker'

/** Enkel svensk tid: "nyss", "5 min sedan", "3 tim sedan", "igår 14:05", "12 sep 14:05". */
function formatCommentTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const sec = Math.round((now - t) / 1000)
  const clock = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  if (sec < 60) return 'nyss'
  if (sec < 3600) return `${Math.floor(sec / 60)} min sedan`
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (t >= today.getTime() && sec < 6 * 3600) return `${Math.floor(sec / 3600)} tim sedan`
  if (t >= today.getTime()) return `idag ${clock}`
  if (t >= yesterday.getTime()) return `igår ${clock}`
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  const date = d.toLocaleDateString('sv-SE', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${date} ${clock}`
}

function fullTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' })
}

const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#7D0037', fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
  padding: '8px 10px', minHeight: 40, borderRadius: 8,
}
const dangerBtn: React.CSSProperties = { ...actionBtn, color: '#7D0037' }

interface Props {
  message: PassMessage
  replies?: PassMessage[]
  isReply?: boolean
  meId: string
  canModerate: boolean
  participants: CommentParticipant[]
  onCreate: (body: string, mentionIds: string[], parentId: number | null) => Promise<boolean>
  onEdit: (id: number, body: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
  /** Anropas när kommentaren tagits bort, så att fokus kan flyttas till ett ställe som finns kvar. */
  onDeleted: () => void
}

type Focusable = 'edit' | 'reply' | 'delete' | 'confirmCancel' | null

export default function CommentItem(props: Props) {
  const { message: m, replies = [], isReply, meId, canModerate, participants, onCreate, onEdit, onDelete, onDeleted } = props

  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view')
  const [replying, setReplying] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const editRef = useRef<HTMLButtonElement>(null)
  const replyRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const confirmCancelRef = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<Focusable>(null)

  // Flytta fokus efter att vyn bytts (spara, avbryt, bekräfta)
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    const el = { edit: editRef, reply: replyRef, delete: deleteRef, confirmCancel: confirmCancelRef }[target].current
    el?.focus()
  }, [mode, replying])

  const deleted = m.deletedAt != null
  const pending = m.id < 0 // skickas just nu
  const isOwn = !!m.authorId && m.authorId === meId
  const canEdit = isOwn && !deleted && !pending
  const canDelete = (isOwn || canModerate) && !deleted && !pending
  const canReply = !isReply && !deleted && !pending
  const who = m.authorName || 'okänd'

  const confirmDelete = async () => {
    setDeleting(true)
    const ok = await onDelete(m.id)
    setDeleting(false)
    if (ok) {
      setMode('view')
      onDeleted()
    } else {
      focusNext.current = 'confirmCancel'
    }
  }

  return (
    <article
      id={`pass-comment-${m.id}`}
      aria-label={deleted ? 'Borttagen kommentar' : `${isReply ? 'Svar' : 'Kommentar'} från ${who}`}
      style={{
        background: '#FFF7F2',
        border: '1px solid rgba(125,0,55,0.18)',
        borderRadius: 12,
        padding: '10px 12px',
        opacity: pending ? 0.7 : 1,
      }}
    >
      {deleted ? (
        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', fontStyle: 'italic', margin: 0 }}>Kommentaren är borttagen.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{who}</span>
            {m.authorIsStaff && <StaffBadge />}
            <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>
              <time dateTime={m.createdAt} title={fullTime(m.createdAt)}>
                {pending ? 'skickas…' : formatCommentTime(m.createdAt)}
              </time>
              {m.editedAt && <span> (redigerad)</span>}
            </span>
          </div>

          {mode === 'edit' ? (
            <CommentComposer
              label="Ändra din kommentar"
              submitLabel="Spara"
              sendingLabel="Sparar…"
              initialValue={m.body}
              participants={[]}
              autoFocus
              compact
              onSubmit={async body => {
                const ok = await onEdit(m.id, body)
                if (ok) { focusNext.current = 'edit'; setMode('view') }
                return ok
              }}
              onCancel={() => { focusNext.current = 'edit'; setMode('view') }}
            />
          ) : (
            <p style={{ fontSize: 15, color: '#000', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
              {splitMentions(m.body, m.mentions).map((s, i) =>
                s.kind === 'mention' ? (
                  <span key={i} style={{ color: '#7D0037', fontWeight: 500, background: '#FFC3AA', borderRadius: 4, padding: '0 2px' }}>
                    {s.text}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          )}

          {mode === 'confirm' && (
            <div
              role="group"
              aria-label="Bekräfta borttagning"
              style={{ marginTop: 10, background: '#FFC3AA', border: '1px solid #FF785A', borderRadius: 10, padding: 12 }}
            >
              <p style={{ fontSize: 14, fontWeight: 500, color: '#7D0037', margin: '0 0 10px' }}>Ta bort kommentaren?</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  ref={confirmCancelRef}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={deleting}
                  onClick={() => { focusNext.current = 'delete'; setMode('view') }}
                >
                  Avbryt
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? 'Tar bort…' : 'Ta bort'}
                </button>
              </div>
            </div>
          )}

          {mode === 'view' && (canReply || canEdit || canDelete) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 4, marginLeft: -10 }}>
              {canReply && (
                <button
                  ref={replyRef}
                  type="button"
                  style={actionBtn}
                  aria-expanded={replying}
                  aria-label={`Svara på kommentaren från ${who}`}
                  onClick={() => setReplying(r => !r)}
                >
                  <IconArrowBackUp size={17} aria-hidden="true" /> Svara
                </button>
              )}
              {canEdit && (
                <button
                  ref={editRef}
                  type="button"
                  style={actionBtn}
                  aria-label="Redigera din kommentar"
                  onClick={() => { setReplying(false); setMode('edit') }}
                >
                  <IconPencil size={17} aria-hidden="true" /> Redigera
                </button>
              )}
              {canDelete && (
                <button
                  ref={deleteRef}
                  type="button"
                  style={dangerBtn}
                  aria-label={isOwn ? 'Ta bort din kommentar' : `Ta bort kommentar från ${who}`}
                  onClick={() => { focusNext.current = 'confirmCancel'; setMode('confirm') }}
                >
                  <IconTrash size={17} aria-hidden="true" /> Ta bort
                </button>
              )}
            </div>
          )}
        </>
      )}

      {(replies.length > 0 || replying) && (
        <div style={{ marginTop: 10, marginLeft: 4, paddingLeft: 12, borderLeft: '2px solid rgba(125,0,55,0.18)' }}>
          {replies.length > 0 && (
            <ul aria-label={`Svar till ${deleted ? 'borttagen kommentar' : who}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {replies.map(r => (
                <li key={r.id}>
                  <CommentItem
                    message={r}
                    isReply
                    meId={meId}
                    canModerate={canModerate}
                    participants={participants}
                    onCreate={onCreate}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onDeleted={() => (deleted ? onDeleted() : replyRef.current?.focus())}
                  />
                </li>
              ))}
            </ul>
          )}
          {replying && (
            <div style={{ marginTop: replies.length ? 10 : 0 }}>
              <CommentComposer
                label={`Ditt svar till ${who}`}
                submitLabel="Skicka"
                participants={participants}
                autoFocus
                compact
                onSubmit={async (body, ids) => {
                  const ok = await onCreate(body, ids, m.id)
                  if (ok) { focusNext.current = 'reply'; setReplying(false) }
                  return ok
                }}
                onCancel={() => { focusNext.current = 'reply'; setReplying(false) }}
              />
            </div>
          )}
        </div>
      )}
    </article>
  )
}
