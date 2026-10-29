import { formatUnread } from '@/lib/chatClient'

/** Rund märke med antal olästa på menyvalet Chatt. Skärmläsare får texten "N olästa". */
export default function UnreadBadge({ count, className = '' }: { count: number; className?: string }) {
  return (
    <span className={`nav-badge ${className}`.trim()}>
      <span aria-hidden="true">{formatUnread(count)}</span>
      <span className="sr-only">{count > 99 ? 'Över 99 olästa' : `${count} olästa`}</span>
    </span>
  )
}
