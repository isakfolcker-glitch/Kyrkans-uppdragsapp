'use client'
import { useApp } from '@/lib/appStore'
import PassQASection from './PassQASection'

export default function PassQAModal({ passId }: { passId: number }) {
  const { passes, closeModal } = useApp()
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  return (
    <>
      <div className="modal-title">💬 {p.title}</div>
      <div style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
      </div>
      <PassQASection passId={passId} />
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Stäng</button>
      </div>
    </>
  )
}
