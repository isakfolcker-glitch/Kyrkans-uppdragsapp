// Radering och export av personuppgifter (GDPR art. 15, 17 och 20).
// Används både när en person raderar sitt eget konto och när en admin tar bort en person.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Tar bort eller anonymiserar allt som hör till en person. Anropas med service role-klient. */
export async function deletePersonData(admin: SupabaseClient, profileId: string): Promise<void> {
  const { data: profile } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle()

  await admin.from('pass_responsible').delete().eq('profile_id', profileId)
  await admin.from('profile_groups').delete().eq('profile_id', profileId)
  await admin.from('staff_permissions').delete().eq('profile_id', profileId)
  await admin.from('notif_settings').delete().eq('profile_id', profileId)
  await admin.from('notifications').delete().eq('user_id', profileId)
  await admin.from('waitlist').delete().eq('profile_id', profileId)
  await admin.from('bookings').delete().eq('profile_id', profileId)
  await deletePersonComments(admin, profileId)
  await admin.from('message_logs').update({ from_name: 'Borttagen användare' }).eq('from_user_id', profileId)
  await admin.from('passes').update({ vk_profile_id: null }).eq('vk_profile_id', profileId)
  if (profile?.email) {
    // ilike utan jokertecken: skiftlägesokänslig men exakt matchning
    const exact = profile.email.replace(/[\\%_]/g, (c: string) => '\\' + c)
    await admin.from('applications').delete().ilike('email', exact)
  }
  await admin.from('profiles').delete().eq('id', profileId)
}

/**
 * Personens kommentarer på pass. Kommentarer som andra har svarat på
 * anonymiseras (så att svaren finns kvar), övriga raderas. Notiser hos andra
 * om personens kommentarer raderas. Nämningar av personen försvinner via
 * ON DELETE CASCADE när profilen raderas.
 */
async function deletePersonComments(admin: SupabaseClient, profileId: string): Promise<void> {
  const { data: mine } = await admin.from('pass_messages').select('id, parent_id').eq('author_id', profileId)
  const ids = (mine ?? []).map(m => m.id as number)
  if (!ids.length) return

  await admin.from('notifications').delete().in('comment_id', ids)
  await admin.from('pass_message_mentions').delete().in('message_id', ids)

  // Kommentarer (inte svar) som har svar från någon annan som inte är borttagna
  const topIds = (mine ?? []).filter(m => m.parent_id == null).map(m => m.id as number)
  const { data: replies } = topIds.length
    ? await admin.from('pass_messages').select('parent_id, author_id')
        .in('parent_id', topIds).is('deleted_at', null)
    : { data: [] as { parent_id: number; author_id: string | null }[] }
  const keep = new Set((replies ?? []).filter(r => r.author_id !== profileId).map(r => r.parent_id as number))

  if (keep.size) {
    const keepIds = Array.from(keep)
    await admin.from('pass_messages')
      .update({ body: '', author_name: 'Borttagen användare', author_id: null, deleted_at: new Date().toISOString() })
      .in('id', keepIds).is('deleted_at', null)
    await admin.from('pass_messages')
      .update({ body: '', author_name: 'Borttagen användare', author_id: null })
      .in('id', keepIds)
  }
  const remove = ids.filter(id => !keep.has(id))
  if (remove.length) await admin.from('pass_messages').delete().in('id', remove)
}

/** Samlar allt som finns lagrat om en person. Anropas med personens egen klient. */
export async function collectPersonData(supabase: SupabaseClient, profileId: string) {
  const [profile, bookings, waitlist, groups, notifications, notifSettings, messages, staffPerms, mentions, memberships, churchPerms] = await Promise.all([
    supabase.from('profiles').select('name, email, phone, birth_year, emergency_contact_name, emergency_contact_phone, role, admin_level, church_id, is_employee, available, created_at, updated_at').eq('id', profileId).single(),
    supabase.from('bookings').select('pass_id, name, mail, tel, source, created_at').eq('profile_id', profileId),
    supabase.from('waitlist').select('pass_id, name, mail, created_at').eq('profile_id', profileId),
    supabase.from('profile_groups').select('group_id').eq('profile_id', profileId),
    supabase.from('notifications').select('type, title, body, read, created_at').eq('user_id', profileId),
    supabase.from('notif_settings').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('pass_messages').select('id, pass_id, parent_id, body, created_at, edited_at, deleted_at').eq('author_id', profileId),
    supabase.from('staff_permissions').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('pass_message_mentions').select('message_id, pass_messages(pass_id)').eq('profile_id', profileId),
    supabase.from('profile_churches').select('church_id, role, admin_level, is_employee, active, invited_at, accepted_at').eq('profile_id', profileId),
    supabase.from('profile_church_permissions').select('*').eq('profile_id', profileId),
  ])

  // Kommentarer där personen är @nämnd: bara id och pass, inte andras text
  const namndI = (mentions.data ?? []).map(m => {
    const pm = (m as { pass_messages?: { pass_id: number } | { pass_id: number }[] | null }).pass_messages
    return { id: m.message_id as number, pass_id: (Array.isArray(pm) ? pm[0]?.pass_id : pm?.pass_id) ?? null }
  })

  return {
    exportDate: new Date().toISOString(),
    gdprInfo: 'Exporterad enligt GDPR artikel 15 och 20, rätt till tillgång och dataportabilitet',
    personuppgifter: profile.data,
    bokningar: bookings.data ?? [],
    vantelistor: waitlist.data ?? [],
    uppdragsgrupper: groups.data?.map(g => g.group_id) ?? [],
    notiser: notifications.data ?? [],
    notisinstallningar: notifSettings.data ?? null,
    fragorOchMeddelanden: messages.data ?? [],
    namndIKommentarer: namndI,
    personalbehorigheter: staffPerms.data ?? null,
    forsamlingar: memberships.data ?? [],
    behorigheterPerForsamling: churchPerms.data ?? [],
  }
}
