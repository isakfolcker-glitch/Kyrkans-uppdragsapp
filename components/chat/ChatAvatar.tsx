import { avBg, avFg } from '@/lib/avatarColors'
import Icon from '@/components/ui/Icon'

/** Initialer i en rund avatar med personens färger (dekoration, namnet står bredvid). */
export function PersonAvatar({ ini, av, ac, size = 36 }: { ini: string; av: string | null; ac: string | null; size?: number }) {
  return (
    <span
      className="chat-avatar"
      aria-hidden="true"
      style={{ width: size, height: size, background: avBg(av), color: avFg(ac), fontSize: Math.round(size * 0.38) }}
    >
      {ini || '?'}
    </span>
  )
}

/** Standardikon för en grupp. Grupper har ingen egen bild ännu. */
export function GroupAvatar({ size = 44 }: { size?: number }) {
  return (
    <span className="chat-avatar chat-avatar-group" aria-hidden="true" style={{ width: size, height: size }}>
      <Icon name="UsersGroup" size={Math.round(size * 0.5)} />
    </span>
  )
}
