// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ pathname: '/dashboard', client: null as unknown }))
vi.mock('next/navigation', () => ({ usePathname: () => runtime.pathname }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => runtime.client }))
import { AppProvider } from '@/lib/appStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const user = { id: 'fictional-lifetime-user', email: 'lifetime@example.com' }
const profile = { ...user, name: 'Testperson', role: 'ideell', admin_level: 'none', church_id: 1,
  onboarding_done: true, updated_at: '2026-01-01', profile_groups: [], notif_settings: [] }
type Result = { data: unknown; error: null }
type Query = { table: string; signal?: AbortSignal }

function makeClient() {
  const initialAuth = deferred<{ data: { user: typeof user | null } }>()
  const queries: Query[] = []
  const paused = new Map<string, ReturnType<typeof deferred<Result>>>()
  const callbacks: ((event: string, session: { user: typeof user } | null) => void)[] = []
  const unsubscribe = vi.fn()
  const controls = { initializeGate: null as ReturnType<typeof deferred<void>> | null,
    startGate: null as ReturnType<typeof deferred<void>> | null }
  const refreshEvents: string[] = []
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  const client = {
    queries, paused, initialAuth, callbacks, unsubscribe, notificationChannel: channel, controls, refreshEvents,
    auth: {
      initialize: vi.fn(async () => { await controls.initializeGate?.promise }),
      startAutoRefresh: vi.fn(async () => {
        refreshEvents.push('start:begin')
        await controls.startGate?.promise
        refreshEvents.push('start:done')
      }),
      stopAutoRefresh: vi.fn(async () => { refreshEvents.push('stop') }),
      signOut: vi.fn(),
      getUser: vi.fn(() => initialAuth.promise),
      onAuthStateChange: vi.fn((callback: typeof callbacks[number]) => {
        callbacks.push(callback)
        return { data: { subscription: { unsubscribe } } }
      }),
    },
    from: vi.fn((table: string) => {
      const entry: Query = { table }
      queries.push(entry)
      const response = () => paused.get(table)?.promise ?? Promise.resolve({ data: table === 'profiles' ? profile : [], error: null })
      const builder = {
        select: () => builder, eq: () => builder, not: () => builder, order: () => builder,
        limit: () => builder, in: () => builder, single: () => builder, maybeSingle: () => builder,
        abortSignal: (signal: AbortSignal) => { entry.signal = signal; return builder },
        then: (resolve: (result: Result) => unknown, reject: (reason: unknown) => unknown) => response().then(resolve, reject),
      }
      return builder
    }),
    channel: vi.fn((topic: string) => {
      if (!topic) throw new Error('Notiskanalens ämne saknas')
      return channel
    }),
    removeChannel: vi.fn(async () => 'ok'),
  }
  return client
}

describe('appens dataladdning när den lämnas för demo', () => {
  let root: Root | null
  let client: ReturnType<typeof makeClient>
  let element: HTMLDivElement

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    client = makeClient()
    runtime.client = client
    runtime.pathname = '/dashboard'
    localStorage.clear()
    element = document.createElement('div')
    document.body.appendChild(element)
    root = createRoot(element)
  })
  afterEach(async () => {
    if (root) await act(async () => { root!.unmount() })
    element.remove()
    vi.restoreAllMocks()
  })

  async function mount(strict = false) {
    const provider = createElement(AppProvider, null, null)
    await act(async () => { root!.render(strict ? createElement(StrictMode, null, provider) : provider) })
  }
  async function enterDemo() {
    runtime.pathname = '/demo'
    await act(async () => { root!.render(createElement(AppProvider, null, null)) })
  }
  async function signIn() {
    await act(async () => { client.initialAuth.resolve({ data: { user } }) })
  }

  it('en sen inloggningskontroll får inte börja läsa data efter byte till demo', async () => {
    await mount()
    await enterDemo()
    await signIn()
    await act(async () => { client.callbacks[0]('SIGNED_IN', { user }) })
    expect(client.from).not.toHaveBeenCalled()
    expect(client.channel).not.toHaveBeenCalled()
    expect(client.unsubscribe).toHaveBeenCalledOnce()
  })

  for (const pendingTable of ['profiles', 'churches', 'notifications']) {
    it(`avbryter väntande ${pendingTable} och fortsätter inte efter byte till demo`, async () => {
      const pending = deferred<Result>()
      client.paused.set(pendingTable, pending)
      await mount()
      await signIn()
      const waiting = client.queries.find(query => query.table === pendingTable)!
      expect(waiting).toBeDefined()
      expect(waiting.signal?.aborted).toBe(false)
      const queriesBeforeDemo = client.queries.length
      await enterDemo()
      expect(waiting.signal?.aborted).toBe(true)
      // Model an HTTP response already in flight that resolves despite abort.
      await act(async () => { pending.resolve({ data: pendingTable === 'profiles' ? profile : [], error: null }) })
      expect(client.queries).toHaveLength(queriesBeforeDemo)
      expect(client.channel).not.toHaveBeenCalled()
    })
  }

  it('stänger sin egen notiskanal och skapar ingen ny när sidan blivit demo', async () => {
    await mount()
    await signIn()
    expect(client.channel).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(new RegExp(`^notif-${user.id}-`)))
    expect(client.notificationChannel.subscribe).toHaveBeenCalledOnce()
    expect(client.queries.every(query => query.signal && !query.signal.aborted)).toBe(true)
    await enterDemo()
    expect(client.removeChannel).toHaveBeenCalledExactlyOnceWith(client.notificationChannel)
    expect(client.queries.every(query => query.signal?.aborted)).toBe(true)
    await act(async () => { client.callbacks[0]('SIGNED_IN', { user }) })
    expect(client.channel).toHaveBeenCalledOnce()
  })

  it('StrictMode avbryter gamla callbacks men lämnar den nya laddningen aktiv', async () => {
    await mount(true)
    expect(client.callbacks).toHaveLength(2)
    // The first effect has been cleaned up. Its callback cannot begin a query.
    await act(async () => { client.callbacks[0]('SIGNED_IN', { user }) })
    expect(client.from).not.toHaveBeenCalled()
    await signIn()
    expect(client.channel).toHaveBeenCalledOnce()
    expect(client.queries.every(query => query.signal && !query.signal.aborted)).toBe(true)
    await enterDemo()
    expect(client.removeChannel).toHaveBeenCalledExactlyOnceWith(client.notificationChannel)
  })

  it('sen authinit får inte starta förnyelse efter att demo har öppnats', async () => {
    const initialize = deferred<void>()
    client.controls.initializeGate = initialize
    await mount()
    await enterDemo()
    await act(async () => { initialize.resolve() })
    expect(client.auth.startAutoRefresh).not.toHaveBeenCalled()
    expect(client.auth.stopAutoRefresh).toHaveBeenCalled()
    expect(client.refreshEvents.at(-1)).toBe('stop')
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('en pågående långsam refreshstart följs av stopp efter byte till demo', async () => {
    const start = deferred<void>()
    client.controls.startGate = start
    await mount()
    expect(client.auth.startAutoRefresh).toHaveBeenCalledOnce()
    await enterDemo()
    expect(client.auth.stopAutoRefresh).not.toHaveBeenCalled()
    await act(async () => { start.resolve() })
    expect(client.refreshEvents).toEqual(['start:begin', 'start:done', 'stop'])
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('synlig app återupptar refresh, dold app stoppar och demo återupptar aldrig', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await mount()
    expect(client.refreshEvents.at(-1)).toBe('start:done')
    visibility.mockReturnValue('hidden')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(client.refreshEvents.at(-1)).toBe('stop')
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(client.refreshEvents.at(-1)).toBe('start:done')
    await enterDemo()
    expect(client.refreshEvents.at(-1)).toBe('stop')
    const starts = client.auth.startAutoRefresh.mock.calls.length
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(starts)
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('StrictMode och ny montering lämnar senaste skarpa app aktiv tills den lämnas', async () => {
    await mount(true)
    expect(client.refreshEvents.at(-1)).toBe('start:done')
    await enterDemo()
    expect(client.refreshEvents.at(-1)).toBe('stop')
    runtime.pathname = '/dashboard'
    await mount(true)
    expect(client.refreshEvents.at(-1)).toBe('start:done')
    await enterDemo()
    expect(client.refreshEvents.at(-1)).toBe('stop')
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('sen init under StrictMode och återmontering följer senaste aktiva ägaren', async () => {
    const initialize = deferred<void>()
    client.controls.initializeGate = initialize
    await mount(true)
    await enterDemo()
    runtime.pathname = '/dashboard'
    await mount()
    await act(async () => { initialize.resolve() })
    expect(client.refreshEvents.at(-1)).toBe('start:done')
    await enterDemo()
    expect(client.refreshEvents.at(-1)).toBe('stop')
  })

  it('dubbla samtidiga inloggningsladdningar skapar bara en notiskanal', async () => {
    await mount()
    await act(async () => {
      client.initialAuth.resolve({ data: { user } })
      client.callbacks[0]('SIGNED_IN', { user })
      client.callbacks[0]('SIGNED_IN', { user })
    })
    expect(client.channel).toHaveBeenCalledOnce()
    expect(client.notificationChannel.subscribe).toHaveBeenCalledOnce()
    await enterDemo()
    expect(client.removeChannel).toHaveBeenCalledExactlyOnceWith(client.notificationChannel)
  })

  it('ny montering återanvänder inte ämnet för en tidigare stängd notiskanal', async () => {
    await mount()
    await signIn()
    await enterDemo()
    runtime.pathname = '/dashboard'
    await mount()
    expect(client.channel).toHaveBeenCalledTimes(2)
    expect(client.channel.mock.calls[0][0]).not.toBe(client.channel.mock.calls[1][0])
  })
})
