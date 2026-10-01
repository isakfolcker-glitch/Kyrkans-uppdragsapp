// Rena hjälpfunktioner för @nämningar i kommentarer. Används i webbläsaren,
// inga databasanrop. Texten renderas alltid som vanlig text (ingen HTML).

export type MentionRef = { profileId: string; name: string }

export type TextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; profileId: string }

export const COMMENT_MAX_LENGTH = 2000

/** Tecken som får stå direkt före @ för att det ska räknas som en nämning. */
const BEFORE_AT = /[\s([{"'«]/
/** Bokstav eller siffra, även å, ä, ö och andra språk. */
const WORD_CHAR = /[\p{L}\p{N}]/u

function atAllowed(text: string, at: number) {
  return at === 0 || BEFORE_AT.test(text[at - 1])
}

function endsWord(ch: string | undefined) {
  return ch === undefined || !WORD_CHAR.test(ch)
}

/**
 * Delar upp en kommentar i vanlig text och @nämningar. Bara namn på personer som
 * faktiskt är nämnda (från API:t) markeras. Längsta namnet vinner om två namn
 * börjar likadant ("Anna" och "Anna Berg").
 */
export function splitMentions(body: string, mentions: MentionRef[]): TextSegment[] {
  if (!body) return []
  const names = mentions
    .filter(m => m.name && m.name.trim())
    .slice()
    .sort((a, b) => b.name.length - a.name.length)
  if (!names.length) return [{ kind: 'text', text: body }]

  const out: TextSegment[] = []
  let buf = ''
  let i = 0
  while (i < body.length) {
    if (body[i] === '@' && atAllowed(body, i)) {
      const hit = names.find(m =>
        body.startsWith(m.name, i + 1) && endsWord(body[i + 1 + m.name.length]),
      )
      if (hit) {
        if (buf) { out.push({ kind: 'text', text: buf }); buf = '' }
        out.push({ kind: 'mention', text: '@' + hit.name, profileId: hit.profileId })
        i += 1 + hit.name.length
        continue
      }
    }
    buf += body[i]
    i++
  }
  if (buf) out.push({ kind: 'text', text: buf })
  return out
}

/**
 * Vilka av de valda personerna som fortfarande står som @Namn i texten.
 * Används precis innan man skickar, så att en person som suddats bort ur
 * texten inte får en notis.
 */
export function pruneMentionIds(body: string, selected: MentionRef[]): string[] {
  const ids: string[] = []
  for (const s of splitMentions(body, selected)) {
    if (s.kind === 'mention' && !ids.includes(s.profileId)) ids.push(s.profileId)
  }
  return ids
}

/**
 * Om markören står i ett påbörjat @namn: var @ står och vad man skrivit efter.
 * Namnet får innehålla enkla mellanslag ("@Anna Be"), men inte radbrytning.
 */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || !atAllowed(before, at)) return null
  const query = before.slice(at + 1)
  if (query.length > 40) return null
  if (/[\r\n]/.test(query) || /^\s/.test(query) || /\s\s/.test(query)) return null
  return { start: at, query }
}

/** Personer som matchar det man skrivit efter @: början av namnet eller av något ord i namnet. */
export function filterParticipants<T extends { name: string }>(list: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLocaleLowerCase('sv')
  const hits = q
    ? list.filter(p => {
        const name = p.name.toLocaleLowerCase('sv')
        return name.startsWith(q) || name.split(/\s+/).some(w => w.startsWith(q))
      })
    : list
  return hits.slice(0, limit)
}

/** Ersätter "@påbörjat" med "@Förnamn Efternamn " och returnerar ny markörposition. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const rest = text.slice(caret).replace(/^[^\s]*/, '') // resten av ordet man stod i
  const inserted = '@' + name + ' '
  const after = rest.startsWith(' ') ? rest.slice(1) : rest
  return { text: text.slice(0, start) + inserted + after, caret: start + inserted.length }
}
