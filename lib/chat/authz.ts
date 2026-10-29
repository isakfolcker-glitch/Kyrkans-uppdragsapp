// Behörighet för chatten. Frågar databasens funktioner (migration 020) med
// användarens EGEN klient, så att API:t och RLS aldrig kan skilja sig åt.
// Ingen admingren: admin utan medlemskap i gruppen nekas precis som alla andra.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isValidGroupId } from './validate'

/** Det av klienten vi behöver för behörighetsfrågor (gör det enkelt att testa). */
export type RpcClient = Pick<SupabaseClient, 'rpc'>

/** Inloggad användare och dennes egna databasklient. userId är null om ej inloggad. */
export async function getChatCaller(): Promise<{ userId: string | null; supabase: SupabaseClient }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { userId: user?.id ?? null, supabase }
}

async function ask(client: RpcClient, fn: 'is_group_chat_member' | 'is_group_chat_leader' | 'can_post_in_group_chat', groupId: string): Promise<boolean> {
  if (!isValidGroupId(groupId)) return false
  const { data, error } = await client.rpc(fn, { gid: groupId })
  // Vid fel nekas åtkomst
  return !error && data === true
}

/** Medlem i gruppens chatt (läsa). */
export const isChatMember = (client: RpcClient, groupId: string) => ask(client, 'is_group_chat_member', groupId)

/** Gruppansvarig i gruppen. */
export const isChatLeader = (client: RpcClient, groupId: string) => ask(client, 'is_group_chat_leader', groupId)

/** Medlem och chatten är inte arkiverad (skriva, redigera, ta bort). */
export const canPostInChat = (client: RpcClient, groupId: string) => ask(client, 'can_post_in_group_chat', groupId)

export type ChatAccess = 'read_write' | 'read_only' | 'none'

/**
 * Ett samlat besked för routes som behöver skilja på "ingen åtkomst" (403) och
 * "arkiverad" (läsbar men inte skrivbar). Frågar bara det som behövs.
 */
export async function chatAccess(client: RpcClient, groupId: string): Promise<ChatAccess> {
  if (!(await isChatMember(client, groupId))) return 'none'
  return (await canPostInChat(client, groupId)) ? 'read_write' : 'read_only'
}
