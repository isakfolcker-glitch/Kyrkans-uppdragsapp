'use client'
import { createClient } from '@/lib/supabase/client'
import PendingInvitations from '@/components/layout/PendingInvitations'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'

export default function NoAccessPage() {
  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <AuthCard title={<>Ingen aktiv <span className="serif">församling</span></>}>
      <p style={{ fontSize: 16, color: 'rgba(0,0,0,0.72)', lineHeight: 1.6, marginBottom: 20 }}>
        Ditt konto finns, men är inte kopplat till någon aktiv församling i Kyrkouppdrag.
        Be en administratör i din församling att bjuda in dig.
      </p>
      <PendingInvitations />
      <button className="btn btn-primary" onClick={logout}><Icon name="Logout" size={18} />Logga ut</button>
    </AuthCard>
  )
}
