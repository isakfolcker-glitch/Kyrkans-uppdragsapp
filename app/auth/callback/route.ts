import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.session) {
      // Alla riktiga konton (inbjudna eller godkända ansökningar) har en kyrka
      // kopplad till sig. Om profilen saknar kyrka är det ett helt nytt
      // Google-konto utan koppling till en inbjudan/ansökan – då loggar vi
      // ut igen och skickar personen till ansökningsformuläret istället.
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, church_id')
        .eq('id', data.session.user.id)
        .maybeSingle()

      if (profile?.church_id) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      const email = data.session.user.email ?? ''
      await supabase.auth.signOut()
      // Städa bort det tomma auth-kontot som Supabase skapade automatiskt vid
      // Google-inloggningen, så det inte blir kvarglömda skuggkonton.
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(data.session.user.id)
      } catch {}

      return NextResponse.redirect(`${origin}/ansok?e=${encodeURIComponent(email)}&google=1`)
    }
  }

  // Inbjudningslänkar från Supabase använder #access_token i hash – dessa
  // hanteras inte server-side. Skicka till en klientsida som plockar upp hashen.
  return NextResponse.redirect(`${origin}/auth/confirm`)
}
