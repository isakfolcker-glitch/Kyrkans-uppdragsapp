import { describe, it, expect } from 'vitest'
import { createDemoChat } from '@/lib/demoChat'
import { ChatApiFailure } from '@/lib/chatClient'

const maria = { id: '1', name: 'Maria Lindström', ini: 'ML', av: '#FFC3AA', ac: '#7D0037', groups: ['kyrkv', 'extra'] }
const lars = { id: '4', name: 'Lars Pettersson', ini: 'LP', av: '#FFEBE1', ac: '#7D0037', groups: ['kyrkv', 'doerr'] }
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('demochatten', () => {
  it('visar bara chattar för användarens grupper, senaste först', async () => {
    const t = createDemoChat().transportFor(maria)
    const { chats } = await t.overview()
    expect(chats.map(c => c.groupId).sort()).toEqual(['extra', 'kyrkv'])
    expect(chats.find(c => c.groupId === 'kyrkv')?.unreadCount).toBeGreaterThan(0)
  })

  it('nekar andra gruppers chattar', async () => {
    const t = createDemoChat().transportFor(maria)
    await expect(t.page('doerr', {})).rejects.toBeInstanceOf(ChatApiFailure)
  })

  it('sidindelar med before och after', async () => {
    const t = createDemoChat().transportFor(maria)
    const latest = await t.page('kyrkv', {})
    expect(latest.hasMore).toBe(false)
    const ids = latest.messages.map(m => m.id)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    const after = await t.page('kyrkv', { after: ids[ids.length - 2] })
    expect(after.messages).toHaveLength(1)
    const before = await t.page('kyrkv', { before: ids[2] })
    expect(before.messages.every(m => m.id < ids[2])).toBe(true)
  })

  it('samma clientId ger samma meddelande, aldrig en dubblett', async () => {
    const store = createDemoChat()
    const t = store.transportFor(maria)
    const a = await t.send('kyrkv', { body: ' Hej ', clientId: id(900) })
    const b = await t.send('kyrkv', { body: 'Hej', clientId: id(900) })
    expect(a.duplicate).toBe(false)
    expect(b.duplicate).toBe(true)
    expect(b.message.id).toBe(a.message.id)
    expect(a.message.body).toBe('Hej')
  })

  it('bara författaren kan ändra och ta bort', async () => {
    const store = createDemoChat()
    const m = store.transportFor(maria)
    const l = store.transportFor(lars)
    const sent = (await m.send('kyrkv', { body: 'Hej', clientId: id(901) })).message
    await expect(l.edit('kyrkv', sent.id, 'Nej')).rejects.toMatchObject({ status: 403 })
    const edited = await m.edit('kyrkv', sent.id, 'Hej igen')
    expect(edited.editedAt).not.toBeNull()
    const removed = await m.remove('kyrkv', sent.id)
    expect(removed.deletedAt).not.toBeNull()
    expect(removed.body).toBe('')
    await expect(m.edit('kyrkv', sent.id, 'x')).rejects.toMatchObject({ status: 409 })
  })

  it('läsmarkering nollar olästa och går inte bakåt', async () => {
    const t = createDemoChat().transportFor(maria)
    const last = (await t.page('kyrkv', {})).messages.at(-1)!.id
    await t.markRead('kyrkv', last)
    const { chats } = await t.overview()
    expect(chats.find(c => c.groupId === 'kyrkv')?.unreadCount).toBe(0)
    expect((await t.markRead('kyrkv', 1)).lastReadId).toBe(last)
  })

  it('andras meddelanden blir olästa hos andra', async () => {
    const store = createDemoChat()
    const m = store.transportFor(maria)
    const l = store.transportFor(lars)
    await l.markRead('kyrkv', 9999)
    await m.send('kyrkv', { body: 'Nytt', clientId: id(902) })
    const { chats } = await l.overview()
    expect(chats.find(c => c.groupId === 'kyrkv')?.unreadCount).toBe(1)
  })
})
