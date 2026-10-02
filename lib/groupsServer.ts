import { NextResponse } from 'next/server'
import { createAdminClient } from './supabase/admin'
import { parseGroupEditor } from './groupManagement'

/** Called only after congregation-specific authorization in the route. */
export async function saveGroupEditor(body: Record<string, unknown>, groupId?: string) {
  let input
  try {
    input = parseGroupEditor(body)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Ogiltig grupp.' }, { status: 400 })
  }
  const id = groupId ?? `grupp_${crypto.randomUUID()}`
  const { data, error } = await createAdminClient().rpc('save_group_management', {
    p_group_id: id,
    p_church_id: input.churchId,
    p_label: input.label,
    p_cls: input.cls,
    p_responsible_profile_id: input.responsibleProfileId,
    p_add_member_ids: input.addMemberIds,
    p_remove_member_ids: input.removeMemberIds,
    p_create: !groupId,
  })
  if (error) {
    const invalid = ['22023', '23503', '23514'].includes(error.code)
    return NextResponse.json({ error: invalid ? 'Kontrollera att medlemmar och ansvarig fortfarande tillhör församlingen. Ansvarig måste vara anställd.' : 'Kunde inte spara gruppen. Försök igen.' }, { status: invalid ? 400 : 500 })
  }
  return NextResponse.json(data, { status: groupId ? 200 : 201 })
}
