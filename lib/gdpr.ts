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
  await admin.from('pass_messages').delete().eq('author_id', profileId)
  await admin.from('message_logs').update({ from_name: 'Borttagen användare' }).eq('from_user_id', profileId)
  await admin.from('passes').update({ vk_profile_id: null }).eq('vk_profile_id', profileId)
  if (profile?.email) {
    // ilike utan jokertecken: skiftlägesokänslig men exakt matchning
    const exact = profile.email.replace(/[\\%_]/g, (c: string) => '\\' + c)
    await admin.from('applications').delete().ilike('email', exact)
  }
  await admin.from('profiles').delete().eq('id', profileId)
}

/** Samlar allt som finns lagrat om en person. Anropas med personens egen klient. */
export async function collectPersonData(supabase: SupabaseClient, profileId: string) {
  const [profile, bookings, waitlist, groups, notifications, notifSettings, messages, staffPerms] = await Promise.all([
    supabase.from('profiles').select('name, email, phone, birth_year, emergency_contact_name, emergency_contact_phone, role, admin_level, church_id, is_employee, available, created_at, updated_at').eq('id', profileId).single(),
    supabase.from('bookings').select('pass_id, name, mail, tel, source, created_at').eq('profile_id', profileId),
    supabase.from('waitlist').select('pass_id, name, mail, created_at').eq('profile_id', profileId),
    supabase.from('profile_groups').select('group_id').eq('profile_id', profileId),
    supabase.from('notifications').select('type, title, body, read, created_at').eq('user_id', profileId),
    supabase.from('notif_settings').select('*').eq('profile_id', profileId).maybeSingle(),
    supabase.from('pass_messages').select('pass_id, body, created_at').eq('author_id', profileId),
    supabase.from('staff_permissions').select('*').eq('profile_id', profileId).maybeSingle(),
  ])

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
    personalbehorigheter: staffPerms.data ?? null,
  }
}
