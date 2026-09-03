'use client'
import { useState, InputHTMLAttributes } from 'react'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  wrapperStyle?: React.CSSProperties
}

// Lösenordsfält med möjlighet att visa/dölja innehållet – samma mönster som i andra appar.
export default function PasswordInput({ wrapperStyle, style, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ position: 'relative', ...wrapperStyle }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        style={{ ...style, paddingRight: 40, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Dölj lösenord' : 'Visa lösenord'}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#8A6FB5', fontSize: 16, lineHeight: 1,
        }}
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  )
}
