/** Conversation choices persist independently for each authenticated account. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ConversationStore, conversationPreferences } from '../src/preferences.ts'

it('retains separate choices for identical chat ids and concurrent changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brain-preferences-'))
  try {
    const store = new ConversationStore(root, 4096)
    const a = 'user-' + 'a'.repeat(64), b = 'user-' + 'b'.repeat(64)
    const signal = new AbortController().signal
    expect(await store.get(a, 'chat')).toEqual({ mode: 'chat', project: null })
    await Promise.all([
      store.set(a, 'chat', { mode: 'moa', project: 'project-a' }, signal),
      store.set(a, 'second', { mode: 'chat', project: 'project-b' }, signal),
    ])
    expect(await new ConversationStore(root, 4096).get(a, 'chat')).toEqual({ mode: 'moa', project: 'project-a' })
    expect(await store.get(a, 'second')).toEqual({ mode: 'chat', project: 'project-b' })
    expect(await store.get(b, 'chat')).toEqual({ mode: 'chat', project: null })
    await store.recordTools(a, 'chat', { turn: 'old', status: 'running', calls: [] }, signal)
    await store.recordTools(a, 'chat', { turn: 'new', status: 'running', calls: [] }, signal)
    await store.recordTools(a, 'chat', { turn: 'old', status: 'complete', calls: [{ name: 'stale' }] }, signal)
    expect(await store.tools(a, 'chat')).toMatchObject({ turn: 'new', status: 'running' })
    await store.recordTools(a, 'chat', { turn: 'new', status: 'complete', calls: [{ name: 'calculate' }] }, signal)
    expect(await new ConversationStore(root, 4096).tools(a, 'chat')).toMatchObject({ calls: [{ name: 'calculate' }] })
    expect(await store.tools(b, 'chat')).toEqual({ status: 'empty', calls: [] })
    await expect(store.get('../another-user', 'chat')).rejects.toThrow('storage key')
    await expect(new ConversationStore(root, 1).get(a, 'chat')).rejects.toMatchObject({ status: 413 })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects unknown modes, invalid projects and caller-supplied identity', () => {
  expect(conversationPreferences({ mode: 'moa', project: null })).toEqual({ mode: 'moa', project: null })
  for (const value of [
    { mode: 'unknown', project: null }, { mode: 'chat', project: '../foreign' },
    { mode: 'chat', project: null, principal: 'someone-else' },
  ]) expect(() => conversationPreferences(value)).toThrow()
})
