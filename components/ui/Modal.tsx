'use client'
import { useApp } from '@/lib/appStore'

export default function Modal() {
  const { modal, closeModal } = useApp()
  if (!modal) return null
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
      <div className="modal-box">{modal}</div>
    </div>
  )
}
