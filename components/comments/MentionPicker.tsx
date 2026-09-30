'use client'
// Lista med personer att @nämna. Styrs helt av CommentComposer: textfältet
// behåller fokus och pekar ut vald rad med aria-activedescendant.
import type { CommentParticipant } from '@/types'

export function mentionOptionId(listId: string, index: number) {
  return `${listId}-opt-${index}`
}

export default function MentionPicker({
  id, options, activeIndex, onSelect, onHover,
}: {
  id: string
  options: CommentParticipant[]
  activeIndex: number
  onSelect: (p: CommentParticipant) => void
  onHover: (index: number) => void
}) {
  if (!options.length) return null
  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Personer du kan nämna"
      style={{
        listStyle: 'none', margin: '6px 0 0', padding: 4,
        background: '#fff', border: '1.5px solid rgba(125,0,55,0.35)', borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.12)',
        maxHeight: 220, overflowY: 'auto',
      }}
    >
      {options.map((p, i) => {
        const active = i === activeIndex
        return (
          <li
            key={p.profileId}
            id={mentionOptionId(id, i)}
            role="option"
            aria-selected={active}
            // mousedown i stället för click så att textfältet inte tappar fokus
            onMouseDown={e => { e.preventDefault(); onSelect(p) }}
            onMouseEnter={() => onHover(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', minHeight: 44, borderRadius: 8, cursor: 'pointer',
              background: active ? '#FFC3AA' : 'transparent',
              color: '#000', fontSize: 15,
              outline: active ? '2px solid #7D0037' : 'none', outlineOffset: -2,
            }}
          >
            <span style={{ fontWeight: 500 }}>{p.name}</span>
            {p.isStaff && <StaffBadge />}
          </li>
        )
      })}
    </ul>
  )
}

/** Märket "Personal". Vit text på #7D0037 ger god kontrast. */
export function StaffBadge() {
  return (
    <span style={{
      fontSize: 13, fontWeight: 500, background: '#7D0037', color: '#fff',
      borderRadius: 999, padding: '2px 6px', lineHeight: 1.3,
    }}>
      Personal
    </span>
  )
}
