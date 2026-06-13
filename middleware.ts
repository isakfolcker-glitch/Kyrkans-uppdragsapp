import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/demo') && !pathname.startsWith('/api/demo')) {
    const cookie = req.cookies.get('demo_auth')?.value
    const correct = process.env.DEMO_PASSWORD
    if (!correct || cookie !== correct) {
      return NextResponse.redirect(new URL('/demo-login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/demo/:path*'],
}
