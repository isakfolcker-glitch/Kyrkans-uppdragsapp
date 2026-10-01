'use client'
import { useEffect, useRef } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'

/**
 * Ruta ovanpå sidan. Stängs med knappen Stäng, med Esc eller genom att
 * trycka utanför. Fokus flyttas in när den öppnas och tillbaka när den stängs.
 */
export default function Modal() {
  const { modal, closeModal } = useApp()
  const boxRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const open = Boolean(modal)

  const closeRef = useRef(closeModal)
  useEffect(() => { closeRef.current = closeModal })

  // Ge rutan ett namn för skärmläsare från dess rubrik (innehållet kan bytas).
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const heading = box.querySelector<HTMLElement>('h2, .modal-title, .confirm-title')
    if (heading) {
      if (!heading.id) heading.id = 'modal-rubrik'
      box.setAttribute('aria-labelledby', heading.id)
    } else {
      box.removeAttribute('aria-labelledby')
    }
  })

  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement as HTMLElement | null
    // Fokusera första fältet eller knappen i rutan, om inget redan har fokus där.
    const box = boxRef.current
    if (box && !box.contains(document.activeElement)) {
      const first = box.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close), [href]')
      ;(first ?? box).focus()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnTo.current?.focus?.()
    }
  }, [open])

  if (!modal) return null
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
      <div ref={boxRef} className="modal-box" role="dialog" aria-modal="true" tabIndex={-1}>
        <button type="button" className="modal-close btn btn-secondary btn-sm btn-icon" aria-label="Stäng" onClick={closeModal}>
          <Icon name="X" size={18} />
        </button>
        {modal}
      </div>
    </div>
  )
}
