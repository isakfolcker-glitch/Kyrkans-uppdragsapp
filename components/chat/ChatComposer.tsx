'use client'
// Meddelandefältet längst ned i en chatt. Texten töms direkt när du skickar, och fokus
// stannar kvar så att tangentbordet inte stängs på mobilen.
// På dator skickar Enter, Skift+Enter ger ny rad. På mobil ger Enter ny rad.
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import Icon from '@/components/ui/Icon'
import { MAX_BODY_LENGTH } from '@/lib/chatClient'

interface Props {
  onSend: (body: string) => void
}

const COUNTER_FROM = 3500

export default function ChatComposer({ onSend }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const length = Array.from(text.trim()).length
  const tooLong = length > MAX_BODY_LENGTH
  const canSend = length > 0 && !tooLong

  const resize = () => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  const submit = () => {
    if (!canSend) return
    onSend(text)
    setText('')
    // Fältet blir lågt igen när texten är borta
    requestAnimationFrame(() => { resize(); areaRef.current?.focus() })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    const desktop = window.matchMedia('(pointer: fine)').matches
    if (event.ctrlKey || event.metaKey || (desktop && !event.shiftKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form className="chat-composer" onSubmit={event => { event.preventDefault(); submit() }}>
      <label htmlFor={id} className="sr-only">Skriv ett meddelande</label>
      <textarea
        id={id}
        ref={areaRef}
        rows={1}
        value={text}
        placeholder="Skriv ett meddelande"
        enterKeyHint="enter"
        autoComplete="off"
        aria-describedby={`${id}-info`}
        onChange={event => { setText(event.target.value); resize() }}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="chat-send" aria-label="Skicka meddelande" disabled={!canSend}>
        <Icon name="Send" size={22} />
      </button>
      <div id={`${id}-info`} className="chat-composer-info" aria-live="polite">
        {tooLong
          ? <span className="chat-over">Meddelandet är för långt. Korta ner det med {length - MAX_BODY_LENGTH} tecken.</span>
          : length >= COUNTER_FROM
            ? <span>{length} av {MAX_BODY_LENGTH} tecken</span>
            : <span className="chat-hint">Enter skickar. Skift+Enter ger ny rad.</span>}
      </div>
    </form>
  )
}
