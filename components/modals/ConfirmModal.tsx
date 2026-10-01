'use client'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'

interface Props {
  cls?: string
  /** Namn på en ikon i components/ui/Icon.tsx, t.ex. "Alert" eller "Trash". */
  icon?: string
  title: string
  sub: string
  confirmLabel: string
  confirmCls?: string
  onConfirm: () => void
}

export default function ConfirmModal({ icon, title, sub, confirmLabel, confirmCls = 'btn-danger', onConfirm }: Props) {
  const { closeModal } = useApp()
  return (
    <div className="confirm-box" role="alertdialog" aria-label={title}>
      {icon && <div className="confirm-icon"><Icon name={icon} size={36} /></div>}
      <div className="confirm-title">{title}</div>
      <div className="confirm-sub">{sub}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className={`btn ${confirmCls}`} onClick={() => { onConfirm(); closeModal() }}>{confirmLabel}</button>
      </div>
    </div>
  )
}
