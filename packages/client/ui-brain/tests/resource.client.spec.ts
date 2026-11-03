/** Gateway resources preserve unknown data and reject malformed external values. */
import { afterEach, expect, it, vi } from 'vitest'
import { brainResources, decodeResource } from '../src/client/resource.ts'

afterEach(() => vi.unstubAllGlobals())

it('keeps unknown privacy counts distinct from measured zero', () => {
  expect(decodeResource('privacy', { funde: 0 })).toEqual({ kind: 'privacy', value: { funde: 0 } })
  expect(decodeResource('projects', { projekte: [{ id: 'p', name: 'Project' }] })).toEqual({ kind: 'projects', value: [{ id: 'p', name: 'Project' }] })
  expect(decodeResource('preferences', { mode: 'research', project: null })).toEqual({ kind: 'preferences', value: { mode: 'research', project: null } })
  expect(decodeResource('tools', { status: 'complete', calls: [{ id: 'call-1', name: 'calculate', status: 'completed', arguments: '{}', output: '4' }] })).toMatchObject({ kind: 'tools', value: { calls: [{ name: 'calculate' }] } })
  expect(() => decodeResource('tools', { status: 'complete', calls: [{ name: 'calculate', status: 'selected' }] })).toThrow()
  expect(() => decodeResource('privacy', { funde: -1 })).toThrow()
  expect(() => decodeResource('projects', [{ id: 'p' }])).toThrow()
  expect(() => decodeResource('preferences', { mode: 'unknown', project: null })).toThrow()
})

it('uses authenticated gateway routes and reports failed reads as resource failures', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ projekte: [{ id: 'p', name: 'Own project' }] })))
    .mockResolvedValueOnce(new Response('', { status: 403 }))
    .mockResolvedValueOnce(new Response('', { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  const provider = brainResources(), signal = new AbortController().signal
  const collect = async (address: string) => {
    const frames = []
    for await (const frame of provider.open(address, { signal })) frames.push(frame)
    return frames
  }
  expect(await collect('dsh-resource://brain/projects')).toEqual([{ ok: true, value: { kind: 'projects', value: [{ id: 'p', name: 'Own project' }] } }])
  expect(fetch).toHaveBeenNthCalledWith(1, '/_brain/application/projekte', { signal, credentials: 'same-origin' })
  expect(await collect('dsh-resource://brain/preferences/chat')).toMatchObject([{ ok: false, error: { code: 'brain/read-failed' } }])
  expect(await collect('dsh-resource://brain/privacy/chat')).toEqual([{ ok: true, value: { kind: 'privacy', value: null } }])
})

it('retains central task settings and rejects malformed schedule records', () => {
  const task = { id: 'sched_' + 'a'.repeat(32), name: 'Daily', prompt: 'Check', model: 'router:model',
    enabled: false, attachments: [], schedule: { frequency: 'daily', interval: 1, anchor: '2026-11-04T09:00', timezone: 'Europe/Vienna' },
    chat_mode: 'same' }
  expect(decodeResource('tasks', { data: [task] })).toEqual({ kind: 'tasks', value: [task] })
  expect(() => decodeResource('tasks', { data: [{ ...task, id: '../other' }] })).toThrow()
  expect(() => decodeResource('tasks', { data: [{ ...task, schedule: { ...task.schedule, interval: 0 } }] })).toThrow()
  expect(decodeResource('models', { modelle: [{ id: 'router:model', anzeige: 'Model' }] })).toEqual({ kind: 'models', value: [{ id: 'router:model', name: 'Model' }] })
})

it('shows project write access and completed task output while rejecting malformed responses', () => {
  expect(decodeResource('project', { id: 'p', name: 'Project', anweisungen: '', darfAendern: false,
    dateien: [{ name: 'document.txt', zustand: 'gelesen' }] })).toMatchObject({ value: { writable: false, files: [{ name: 'document.txt' }] } })
  expect(() => decodeResource('project', { id: 'p', name: 'Project', anweisungen: '', dateien: [] })).toThrow()
  expect(decodeResource('runs', { data: [{ id: 'run', task: 'task', status: 'completed', output: '437', error: '' }] }))
    .toMatchObject({ value: [{ output: '437' }] })
  expect(() => decodeResource('runs', { data: [{ id: 'run', task: 'task', status: 'completed', output: 437, error: '' }] })).toThrow()
})
