'use client'
import { useApp } from '@/lib/appStore'
import Icon, { PassMeta } from '@/components/ui/Icon'
import PassQASection from './PassQASection'

export default function PassQAModal({ passId, targetCommentId }: { passId: number; targetCommentId?: number | null }) {
  const { passes, closeModal } = useApp()
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  return (
    <>
      <h2 className="modal-title">{p.title}</h2>
      <PassMeta date={p.date} time={p.time} plats={p.plats} className="meta-row" />
      <PassQASection passId={passId} targetCommentId={targetCommentId} />
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Stäng</button>
      </div>
    </>
  )
}
