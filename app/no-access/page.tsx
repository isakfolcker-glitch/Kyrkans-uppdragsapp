'use client'
import { createClient } from '@/lib/supabase/client'
import PendingInvitations from '@/components/layout/PendingInvitations'

export default function NoAccessPage() {
  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#FFEBE1', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 460, background: '#fff', borderRadius: 20,
        border: '1px solid rgba(125,0,55,0.1)', padding: 32,
        boxShadow: '0 8px 32px rgba(125,0,55,0.12)', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#7D0037',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, margin: '0 auto 16px',
        }}>🔒</div>
        <h1 style={{ fontSize: 22, color: '#000', marginBottom: 10 }}>Ingen aktiv församlingsinbjudan</h1>
        <p style={{ fontSize: 14, color: '#5F5E5A', lineHeight: 1.6, marginBottom: 20 }}>
          Ditt konto finns, men är inte kopplat till någon aktiv församling i Kyrkans uppdragsapp.
          Be en administratör i din församling att bjuda in dig.
        </p>
        <PendingInvitations />
        <button className="btn btn-primary" onClick={logout}>Logga ut</button>
      </div>
    </div>
  )
}
