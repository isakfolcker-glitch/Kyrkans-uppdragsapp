'use client'
// Textfält för ny kommentar, svar och redigering. Skriv @ för att nämna någon.
// Ctrl/Cmd+Enter skickar. Texten sparas och visas alltid som vanlig text.
import { forwardRef, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { IconSend } from '@tabler/icons-react'
import type { CommentParticipant } from '@/types'
import MentionPicker, { mentionOptionId } from './MentionPicker'
import {
  COMMENT_MAX_LENGTH, activeMentionQuery, filterParticipants, insertMention, pruneMentionIds,
  type MentionRef,
} from '@/lib/comments/mentions'

export interface CommentComposerHandle {
  focus: () => void
}

interface Props {
  label: string
  placeholder?: string
  submitLabel: string
  sendingLabel?: string
  initialValue?: string
  /** Tom lista betyder att man inte kan nämna någon här (t.ex. vid redigering). */
  participants: CommentParticipant[]
  /** Ska returnera true om det gick bra. Då töms fältet. */
  onSubmit: (body: string, mentionIds: string[]) => Promise<boolean>
  onCancel?: () => void
  autoFocus?: boolean
  compact?: boolean
}

const srOnly: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
}

const CommentComposer = forwardRef<CommentComposerHandle, Props>(function CommentComposer(
  { label, placeholder, submitLabel, sendingLabel = 'Skickar…', initialValue = '', participants, onSubmit, onCancel, autoFocus, compact },
  ref,
) {
  const baseId = useId()
  const textareaId = `${baseId}-text`
  const counterId = `${baseId}-count`
  const hintId = `${baseId}-hint`
  const listId = `${baseId}-list`

  const [text, setText] = useState(initialValue)
  const [selected, setSelected] = useState<MentionRef[]>([])
  const [sending, setSending] = useState(false)
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // @ där man tryckt Escape: listan hålls stängd tills man skriver ett nytt @
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({ focus: () => areaRef.current?.focus() }), [])

  const mentionsOn = participants.length > 0
  const options = mentionsOn && query && query.start !== dismissedAt
    ? filterParticipants(participants, query.query)
    : []
  const open = options.length > 0
  const active = Math.min(activeIndex, Math.max(0, options.length - 1))

  const updateQuery = (value: string, caret: number) => {
    if (!mentionsOn) return
    const q = activeMentionQuery(value, caret)
    setQuery(q)
    if (!q || q.start !== query?.start) setActiveIndex(0)
    if (!q) setDismissedAt(null)
  }

  const choose = (p: CommentParticipant) => {
    const el = areaRef.current
    if (!el || !query) return
    const caret = el.selectionStart ?? text.length
    const next = insertMention(text, query.start, caret, p.name)
    setText(next.text)
    setSelected(prev => (prev.some(s => s.profileId === p.profileId) ? prev : [...prev, { profileId: p.profileId, name: p.name }]))
    setQuery(null)
    setActiveIndex(0)
    // Flytta markören efter namnet när React har uppdaterat fältet
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  const trimmed = text.trim()
  const canSend = !!trimmed && trimmed.length <= COMMENT_MAX_LENGTH && !sending

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    const ok = await onSubmit(text, pruneMentionIds(text, selected))
    setSending(false)
    if (ok) {
      setText('')
      setSelected([])
      setQuery(null)
    } else {
      areaRef.current?.focus()
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((active + 1) % options.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((active - 1 + options.length) % options.length); return }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault(); choose(options[active]); return
      }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        setDismissedAt(query?.start ?? null)
        return
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); return }
    if (e.key === 'Escape' && onCancel) { e.preventDefault(); e.stopPropagation(); onCancel() }
  }

  const nearLimit = text.length > COMMENT_MAX_LENGTH - 100

  return (
    <div className="form-field" style={{ marginBottom: 0 }}>
      <label htmlFor={textareaId} style={{ color: '#412B72', textTransform: 'none', letterSpacing: 0, fontSize: 13.5, marginBottom: 6 }}>
        {label}
      </label>
      <textarea
        id={textareaId}
        ref={areaRef}
        value={text}
        placeholder={placeholder}
        maxLength={COMMENT_MAX_LENGTH}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
        aria-describedby={`${hintId} ${counterId}`}
        aria-autocomplete={mentionsOn ? 'list' : undefined}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? mentionOptionId(listId, active) : undefined}
        onChange={e => { setText(e.target.value); updateQuery(e.target.value, e.target.selectionStart ?? e.target.value.length) }}
        onSelect={e => updateQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setQuery(null)}
        onKeyDown={onKeyDown}
        style={{ height: 'auto', minHeight: compact ? 64 : 84, resize: 'vertical', fontSize: 16, lineHeight: 1.45 }}
      />
      {open && (
        <MentionPicker
          id={listId}
          options={options}
          activeIndex={active}
          onSelect={choose}
          onHover={setActiveIndex}
        />
      )}
      <div aria-live="polite" style={srOnly}>
        {open ? `${options.length} ${options.length === 1 ? 'person' : 'personer'} att välja. Använd pil upp och ner och tryck Enter.` : ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <span id={hintId} style={{ fontSize: 12.5, color: '#5F5E5A', flex: '1 1 160px' }}>
          {mentionsOn ? 'Skriv @ för att nämna någon.' : ''}
        </span>
        <span id={counterId} style={{ fontSize: 12.5, color: nearLimit ? '#B23A1E' : '#5F5E5A', fontVariantNumeric: 'tabular-nums' }}>
          <span style={srOnly}>Antal tecken: </span>{text.length} / {COMMENT_MAX_LENGTH}
        </span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {onCancel && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={sending}>
              Avbryt
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={!canSend}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: canSend ? 1 : 0.55, cursor: canSend ? 'pointer' : 'not-allowed' }}
          >
            {!sending && submitLabel === 'Skicka' && <IconSend size={16} aria-hidden="true" />}
            {sending ? sendingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
})

export default CommentComposer
