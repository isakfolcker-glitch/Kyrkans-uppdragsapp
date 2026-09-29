import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response = NextResponse.next({ request })
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Demo-lösenordsskydd
  if (pathname.startsWith('/demo') && !pathname.startsWith('/demo-login') && !pathname.startsWith('/api/demo')) {
    const demoPassword = process.env.DEMO_PASSWORD
    const demoCookie = request.cookies.get('demo_auth')?.value
    if (demoPassword && demoCookie !== demoPassword) {
      return NextResponse.redirect(new URL('/demo-login', request.url))
    }
    return response
  }

  if (pathname.startsWith('/demo-login') || pathname.startsWith('/api/demo')) {
    return response
  }

  const isPublicAuthRoute = pathname === '/login' || pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')
  const isPublicRoute = pathname.startsWith('/kiosk') || isPublicAuthRoute || isApiRoute

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('church_id, admin_level, onboarding_done')
      .eq('id', user.id)
      .maybeSingle()

    const { data: memberships, error: membershipError } = await supabase
      .from('profile_churches')
      .select('church_id')
      .eq('profile_id', user.id)
      .eq('active', true)
      .limit(1)

    // Om migration 016 ännu inte är installerad används legacy church_id tillfälligt.
    const hasMembership = membershipError
      ? Boolean(profile?.church_id)
      : Boolean(memberships?.length)
    const hasAccess = hasMembership || profile?.admin_level === 'super'

    if (!hasAccess && pathname !== '/no-access' && !pathname.startsWith('/auth') && !isApiRoute) {
      return NextResponse.redirect(new URL('/no-access', request.url))
    }

    if (hasAccess && pathname === '/no-access') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    if (!profile?.onboarding_done && hasAccess && !pathname.startsWith('/auth/confirm') && !isApiRoute) {
      return NextResponse.redirect(new URL('/auth/confirm', request.url))
    }

    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
