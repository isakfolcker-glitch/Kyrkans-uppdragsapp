import Icon from '@/components/ui/Icon'

export const CHAT_PRIVACY_TEXT = 'Alla medlemmar i gruppen kan läsa tidigare meddelanden, även personer som läggs till senare.'

/** Integritetstext som visas i chatthuvudet och där medlemmar läggs till i en grupp. */
export default function ChatPrivacyNote({ className = '' }: { className?: string }) {
  return (
    <p className={`chat-privacy ${className}`.trim()}>
      <Icon name="Info" size={18} />
      <span>{CHAT_PRIVACY_TEXT}</span>
    </p>
  )
}
