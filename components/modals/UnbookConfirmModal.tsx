'use client'
import { useApp } from '@/lib/appStore'
import ConfirmModal from '@/components/modals/ConfirmModal'

interface Props {
  passId: number
  title: string
  date: string
  time: string
}

export default function UnbookConfirmModal({ passId, title, date, time }: Props) {
  const { doUnbook } = useApp()

  return (
    <ConfirmModal
      icon="⚠️"
      title={`Avboka "${title}"?`}
      sub={`${date} kl. ${time}. Din plats blir ledig för någon annan.`}
      confirmLabel="Ja, avboka"
      confirmCls="btn-warn"
      onConfirm={() => { void doUnbook(passId) }}
    />
  )
}
