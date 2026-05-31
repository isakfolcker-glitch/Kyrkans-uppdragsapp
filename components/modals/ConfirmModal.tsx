'use client'
import { useApp } from '@/lib/appStore'

interface Props {
  cls?: string
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
    <div className="confirm-box">
      {icon && <div className="confirm-icon">{icon}</div>}
      <div className="confirm-title">{title}</div>
      <div className="confirm-sub">{sub}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className={`btn ${confirmCls}`} onClick={() => { onConfirm(); closeModal() }}>{confirmLabel}</button>
      </div>
    </div>
  )
}
