// Behörigheten avgörs av databasens funktioner. Här kontrolleras att API-lagret
// ställer rätt fråga med rätt argument, och att allt utom ett tydligt "true" nekas.
import { describe, it, expect } from 'vitest'
import { chatAccess, isChatMember, isChatLeader, canPostInChat, type RpcClient } from '@/lib/chat/authz'

function client(answers: Record<string, unknown>, error: unknown = null) {
  const calls: { fn: string; args: unknown }[] = []
  const c: RpcClient = {
    rpc: (async (fn: string, args: unknown) => { calls.push({ fn, args }); return { data: answers[fn] ?? false, error } }) as unknown as RpcClient['rpc'],
  }
  return { c, calls }
}

describe('chat-behörighet', () => {
  it('anropar SQL-funktionerna med gruppens id', async () => {
    const { c, calls } = client({ is_group_chat_member: true, is_group_chat_leader: true, can_post_in_group_chat: true })
    expect(await isChatMember(c, 'g1')).toBe(true)
    expect(await isChatLeader(c, 'g1')).toBe(true)
    expect(await canPostInChat(c, 'g1')).toBe(true)
    expect(calls).toEqual([
      { fn: 'is_group_chat_member', args: { gid: 'g1' } },
      { fn: 'is_group_chat_leader', args: { gid: 'g1' } },
      { fn: 'can_post_in_group_chat', args: { gid: 'g1' } },
    ])
  })
  it('icke-medlem nekas', async () => {
    const { c } = client({ is_group_chat_member: false })
    expect(await chatAccess(c, 'g1')).toBe('none')
  })
  it('medlem i arkiverad chatt kan läsa men inte skriva', async () => {
    const { c } = client({ is_group_chat_member: true, can_post_in_group_chat: false })
    expect(await chatAccess(c, 'g1')).toBe('read_only')
  })
  it('medlem i aktiv chatt kan läsa och skriva', async () => {
    const { c } = client({ is_group_chat_member: true, can_post_in_group_chat: true })
    expect(await chatAccess(c, 'g1')).toBe('read_write')
  })
  it('databasfel och oväntade svar nekas', async () => {
    expect(await isChatMember(client({ is_group_chat_member: true }, { message: 'fel' }).c, 'g1')).toBe(false)
    expect(await isChatMember(client({ is_group_chat_member: 'true' }).c, 'g1')).toBe(false)
    expect(await isChatMember(client({ is_group_chat_member: null }).c, 'g1')).toBe(false)
  })
  it('ogiltigt grupp-id når aldrig databasen', async () => {
    const { c, calls } = client({ is_group_chat_member: true })
    expect(await isChatMember(c, '')).toBe(false)
    expect(await isChatMember(c, 'x'.repeat(500))).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
