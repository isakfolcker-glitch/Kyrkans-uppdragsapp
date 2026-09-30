'use client'
// Kommentarer på ett pass. Används i PassDetailModal och PassQAModal.
// Logiken finns i lib/usePassComments.ts, utseendet i components/comments/.
import { useEffect, useId, useRef } from 'react'
import { usePassComments } from '@/lib/usePassComments'
import { groupThread, countLive } from '@/lib/comments/threadView'
import CommentItem from '@/components/comments/CommentItem'
import CommentComposer from '@/components/comments/CommentComposer'

export default function PassQASection({ passId, targetCommentId }: { passId: number; targetCommentId?: number | null }) {
  const c = usePassComments(passId)
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Från en notis: scrolla till och markera rätt kommentar när tråden laddats
  useEffect(() => {
    if (!targetCommentId || c.status !== 'ready') return
    const el = document.getElementById(`pass-comment-${targetCommentId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.outline = '2px solid #7D0037'
    const t = setTimeout(() => { el.style.outline = '' }, 2500)
    return () => clearTimeout(t)
  }, [targetCommentId, c.status])

  const groups = groupThread(c.messages)
  const count = countLive(c.messages)

  return (
    <section aria-labelledby={headingId} style={{ marginTop: 20 }}>
      <h3
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        style={{ fontSize: 13.5, fontWeight: 700, color: '#412B72', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px', outlineOffset: 2 }}
      >
        Kommentarer
        {count > 0 && (
          <span style={{ marginLeft: 6, fontWeight: 500, color: '#5F5E5A', textTransform: 'none', letterSpacing: 0 }}>
            ({count})
          </span>
        )}
      </h3>

      {c.error && (
        <div role="alert" className="alert alert-red" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ flex: 1 }}>{c.error}</span>
          {c.status === 'error' ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={c.reload}>Försök igen</button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={c.clearError}>Stäng</button>
          )}
        </div>
      )}

      {c.status === 'loading' && (
        <p role="status" style={{ fontSize: 14, color: '#5F5E5A', padding: '8px 0', margin: 0 }}>Hämtar kommentarer…</p>
      )}

      {c.status === 'forbidden' && (
        <p style={{ fontSize: 14, color: '#5F5E5A', lineHeight: 1.5, margin: 0 }}>
          Kommentarerna kan bara läsas av dem som är bokade på passet, ansvariga och administratörer.
        </p>
      )}

      {c.status === 'ready' && (
        <>
          {groups.length === 0 ? (
            <p style={{ fontSize: 14, color: '#5F5E5A', textAlign: 'center', padding: '8px 0 14px', margin: 0 }}>
              Inga kommentarer ännu. Skriv gärna om du undrar något.
            </p>
          ) : (
            <ul aria-labelledby={headingId} style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groups.map(g => (
                <li key={g.comment.id}>
                  <CommentItem
                    message={g.comment}
                    replies={g.replies}
                    isReply={g.comment.parentId != null}
                    meId={c.meId}
                    canModerate={c.canModerate}
                    participants={c.participants}
                    onCreate={c.create}
                    onEdit={c.edit}
                    onDelete={c.remove}
                    onDeleted={() => headingRef.current?.focus()}
                  />
                </li>
              ))}
            </ul>
          )}

          <CommentComposer
            label="Skriv en kommentar"
            placeholder="Fråga eller skriv något till de andra på passet"
            submitLabel="Skicka"
            participants={c.participants}
            onSubmit={(body, ids) => c.create(body, ids, null)}
          />
        </>
      )}
    </section>
  )
}
