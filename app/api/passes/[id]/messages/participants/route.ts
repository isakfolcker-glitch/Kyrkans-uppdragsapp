// Personer som kan @nämnas i ett pass kommentarer: alla med åtkomst till passet
// (bokade med konto, ansvariga, vaktmästare, admin för församlingen), aldrig kiosk.
// Returnerar bara namn och personalmärke, aldrig mail eller telefon.
import { NextRequest, NextResponse } from 'next/server'
import { getCaller, canAccessPassThread, loadPassThreadAudience, unauthorized, forbidden } from '@/lib/authz'
import { parseId } from '@/lib/comments/server'
import type { CommentParticipant } from '@/types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()

  const passId = parseId((await params).id)
  if (!passId) return NextResponse.json({ error: 'Ogiltigt pass' }, { status: 400 })
  if (!(await canAccessPassThread(caller, passId, supabase))) return forbidden()

  const audience = await loadPassThreadAudience(passId)
  if (!audience) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })

  const list: CommentParticipant[] = Array.from(audience.members.values())
    .map(m => ({ profileId: m.profileId, name: m.name, isStaff: m.isStaff }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  return NextResponse.json(list)
}
