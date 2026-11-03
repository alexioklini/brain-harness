import { afterEach, expect, it, vi } from 'vitest'
import { BrainAccountClient } from '../src/account.ts'

afterEach(() => vi.unstubAllGlobals())
const alice = { benutzer: { id: 'alice-id', anzeigename: 'Alice', teams: ['team-a'] } }
const bob = { benutzer: { id: 'bob-id', anzeigename: 'Bob', teams: ['team-b'] } }
function reply(value: object, login = false): Response {
  return new Response(JSON.stringify(value), { headers: login ? { 'set-cookie': `fmsitzung=${'a'.repeat(64)}; HttpOnly; SameSite=Strict` } : {} })
}
function client() {
  return new BrainAccountClient({ baseURL: 'https://brain.example', timeoutMs: 1000, maxResponseBytes: 10000 })
}

it('separates storage and chat identities for existing users sharing one application key', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true))
    .mockResolvedValueOnce(reply(bob, true)).mockResolvedValueOnce(reply(alice)).mockResolvedValueOnce(reply(bob))
  vi.stubGlobal('fetch', fetcher)
  const a = await client().login('alice', 'fixture')
  const b = await client().login('bob', 'fixture')
  expect(a.storageKey).not.toBe(b.storageKey)
  const first = await a.authorize('same-chat')
  const second = await b.authorize('same-chat')
  expect(first.session).not.toBe(second.session)
  expect(first.principal).toBe('fm-user-alice-id')
  expect(second.context.teams).toEqual(['team-b'])
  expect(JSON.stringify(a)).not.toContain('fmsitzung')
  expect(fetcher.mock.calls[2]![1]?.headers).toMatchObject({ cookie: `fmsitzung=${'a'.repeat(64)}` })
})

it('refreshes teams and checks selected project access on every call', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true))
    .mockResolvedValueOnce(reply(alice)).mockResolvedValueOnce(reply({ id: 'project-a' }))
    .mockResolvedValueOnce(reply({ benutzer: { ...alice.benutzer, teams: [] } }))
    .mockResolvedValueOnce(new Response('private diagnostic', { status: 403 }))
  vi.stubGlobal('fetch', fetcher)
  const login = await client().login('alice', 'fixture')
  expect((await login.authorize('chat', 'project-a')).context).toEqual({ teams: ['team-a'], project: 'project-a' })
  await expect(login.authorize('chat', 'project-a')).rejects.toThrow('(403)')
  expect(fetcher).toHaveBeenCalledTimes(5)
})

it('rejects changed identities and a closed login without a permission fallback', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true)).mockResolvedValueOnce(reply(bob))
  vi.stubGlobal('fetch', fetcher)
  const login = await client().login('alice', 'fixture')
  await expect(login.authorize('chat')).rejects.toThrow('account changed')
  login.close()
  await expect(login.authorize('chat')).rejects.toThrow('sign-in required')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('rejects missing login cookies and project path injection', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice)).mockResolvedValueOnce(reply(alice, true))
  vi.stubGlobal('fetch', fetcher)
  await expect(client().login('alice', 'fixture')).rejects.toThrow('cookie')
  const login = await client().login('alice', 'fixture')
  await expect(login.authorize('chat', '../another-user')).rejects.toThrow('Invalid Brain project')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('does not authorize an in-flight request after its login is closed', async () => {
  const pending = Promise.withResolvers<Response>()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true))
    .mockReturnValueOnce(pending.promise))
  const login = await client().login('alice', 'fixture')
  const authorization = login.authorize('chat')
  login.close()
  pending.resolve(reply(alice))
  await expect(authorization).rejects.toThrow('sign in again')
})

it('reads account-owned project lists with the private login and fresh identity', async () => {
  const projects = [{ id: 'project-a', name: 'Research' }]
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true))
    .mockResolvedValueOnce(reply(alice)).mockResolvedValueOnce(reply(projects))
  vi.stubGlobal('fetch', fetcher)
  const login = await client().login('alice', 'fixture')
  expect(await login.request('/api/projekte')).toEqual(projects)
  expect(fetcher.mock.calls[2]![1]?.headers).toMatchObject({ cookie: `fmsitzung=${'a'.repeat(64)}` })
})

it('rejects application login replacement and prevents reads after identity changes', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true)).mockResolvedValueOnce(reply(bob))
  vi.stubGlobal('fetch', fetcher)
  const login = await client().login('alice', 'fixture')
  await expect(login.request('/api/anmeldung', { anmeldename: 'bob' })).rejects.toThrow('Invalid Brain application path')
  await expect(login.request('/api/projekte')).rejects.toThrow('account changed')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('uploads project documents with the account cookie and refuses path traversal', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(alice, true))
    .mockResolvedValueOnce(reply(alice)).mockResolvedValueOnce(reply({ dateien: [{ name: 'fixture.txt' }] }))
  vi.stubGlobal('fetch', fetcher)
  const login = await client().login('alice', 'fixture')
  const bytes = new TextEncoder().encode('Fixture evidence')
  expect(await login.uploadProjectFile('project-a', 'fixture.txt', bytes)).toEqual({ dateien: [{ name: 'fixture.txt' }] })
  const options = fetcher.mock.calls[2]?.[1]
  expect(options?.headers).toEqual({ cookie: `fmsitzung=${'a'.repeat(64)}` })
  expect(options?.body).toBeInstanceOf(FormData)
  await expect(login.uploadProjectFile('../foreign', 'fixture.txt', bytes)).rejects.toThrow('Invalid project document')
  await expect(login.uploadProjectFile('project-a', '../foreign.txt', bytes)).rejects.toThrow('Invalid project document')
  expect(fetcher).toHaveBeenCalledTimes(3)
})
