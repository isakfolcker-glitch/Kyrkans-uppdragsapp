'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    // Supabase lägger access_token i URL-hashen för inbjudningslänkar.
    // onAuthStateChange fångar SIGNED_IN-eventet när SDK:n läser hashen.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        router.replace('/dashboard')
      }
    })

    // Läs hashen manuellt ifall eventet redan missades
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.replace('/dashboard')
      })
    }

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div style={{ minHeight: '100vh', background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#534AB7', fontWeight: 600, fontSize: 16 }}>
        Bekräftar inbjudan…
      </div>
    </div>
  )
}
