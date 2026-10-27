'use client'
import Icon from '@/components/ui/Icon'
import { PASSWORD_REQUIREMENTS } from '@/lib/passwordRules'

/**
 * Lösenordskraven som en checklista, uppdaterad medan man skriver (innan man
 * skickar in formuläret). Koppla med aria-describedby på lösenordsfältet.
 */
export default function PasswordChecklist({ password, id }: { password: string; id: string }) {
  return (
    <ul id={id} style={{ listStyle: 'none', margin: '2px 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {PASSWORD_REQUIREMENTS.map(req => {
        const met = req.test(password)
        return (
          <li key={req.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: met ? 'var(--vin)' : 'var(--text-2)' }}>
            <Icon name={met ? 'Check' : 'X'} size={15} style={{ flexShrink: 0 }} />
            <span className="sr-only">{met ? 'Uppfyllt: ' : 'Saknas: '}</span>
            {req.label}
          </li>
        )
      })}
    </ul>
  )
}
