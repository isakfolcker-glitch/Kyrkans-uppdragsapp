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

  // Demo-lösenordsskydd: /demo kräver cookie, /demo-login och /api/demo är öppna
  if (pathname.startsWith('/demo') && !pathname.startsWith('/demo-login') && !pathname.startsWith('/api/demo')) {
    const demoPassword = process.env.DEMO_PASSWORD
    const demoCookie = request.cookies.get('demo_auth')?.value
    if (demoPassword && demoCookie !== demoPassword) {
      return NextResponse.redirect(new URL('/demo-login', request.url))
    }
    return response
  }

  // /demo-login och /api/demo behöver ingen Supabase-auth
  if (pathname.startsWith('/demo-login') || pathname.startsWith('/api/demo')) {
    return response
  }

  // Skicka oinloggade till /login (utom /login, /ansok, /kiosk, /auth/* — /auth/confirm hanterar inbjudningslänkens token i hashen)
  if (!user && pathname !== '/login' && pathname !== '/ansok' && !pathname.startsWith('/kiosk') && !pathname.startsWith('/api') && !pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Skicka inloggade bort från /login
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
