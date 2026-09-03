'use client'
import { checkPassword, passwordScore, PASSWORD_SCORE_LABELS, PASSWORD_SCORE_COLORS, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy'

export default function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const checks = checkPassword(password)
  const score = passwordScore(password)
  const color = PASSWORD_SCORE_COLORS[score]

  const items: [boolean, string][] = [
    [checks.length, `Minst ${PASSWORD_MIN_LENGTH} tecken`],
    [checks.upper, 'Stor bokstav'],
    [checks.lower, 'Liten bokstav'],
    [checks.number, 'Siffra'],
    [checks.symbol, 'Symbol (t.ex. ! ? %)'],
  ]

  return (
    <div style={{ marginTop: -8, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: score > i ? color : '#EFE4DB',
            transition: 'background 0.15s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color, marginBottom: 6 }}>{PASSWORD_SCORE_LABELS[score]}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(([ok, label]) => (
          <span key={label} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 20,
            background: ok ? '#BEE1C8' : '#F1EFE8',
            color: ok ? '#00554B' : '#8A8578',
            fontWeight: 500,
          }}>
            {ok ? '✓' : '·'} {label}
          </span>
        ))}
      </div>
    </div>
  )
}
