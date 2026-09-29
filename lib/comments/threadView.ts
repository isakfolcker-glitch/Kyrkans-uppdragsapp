// Rena hjälpfunktioner för att visa en kommentarstråd i webbläsaren.
// Samma regel som API:t (lib/comments/thread.ts): en borttagen kommentar visas
// bara om den har minst ett svar som inte är borttaget.
import type { PassMessage } from '@/types'

export type CommentGroup = { comment: PassMessage; replies: PassMessage[] }

/** Tar bort borttagna kommentarer som inte har kvar några svar, och borttagna svar. */
export function visibleMessages(messages: PassMessage[]): PassMessage[] {
  const liveParents = new Set(
    messages.filter(m => m.parentId != null && m.deletedAt == null).map(m => m.parentId as number),
  )
  return messages.filter(m => m.deletedAt == null || liveParents.has(m.id))
}

/** Sorterar efter tid och grupperar svar under sin kommentar (en svarsnivå). */
export function groupThread(messages: PassMessage[]): CommentGroup[] {
  const sorted = visibleMessages(messages)
    .slice()
    .sort((a, b) => (Date.parse(a.createdAt) - Date.parse(b.createdAt)) || a.id - b.id)
  const groups = new Map<number, CommentGroup>()
  const order: CommentGroup[] = []
  for (const m of sorted) {
    if (m.parentId == null) {
      const g = { comment: m, replies: [] }
      groups.set(m.id, g)
      order.push(g)
    }
  }
  for (const m of sorted) {
    if (m.parentId == null) continue
    const g = groups.get(m.parentId)
    if (g) g.replies.push(m)
    else order.push({ comment: m, replies: [] }) // svar vars kommentar saknas visas ändå
  }
  return order.sort((a, b) =>
    (Date.parse(a.comment.createdAt) - Date.parse(b.comment.createdAt)) || a.comment.id - b.comment.id)
}

/** Antal synliga kommentarer och svar som inte är borttagna. */
export function countLive(messages: PassMessage[]): number {
  return visibleMessages(messages).filter(m => m.deletedAt == null).length
}
