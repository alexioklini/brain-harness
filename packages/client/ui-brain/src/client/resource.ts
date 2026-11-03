/** Account-aware resource transport; gateway responses remain untrusted JSON. @module */
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import { centralTask } from './task-data.ts'
import type { CentralTask } from './task-data.ts'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** Project information needed by the conversation picker. */
export interface Project { id: string; name: string }
/** Central service execution evidence; names and arguments are never locally substituted. */
export interface ToolEvidence { id: string; name: string; status: 'running' | 'completed' | 'failed'; arguments: string; output: string }
/** User-editable central routing choices. */
export interface Preferences { mode: 'chat' | 'moa' | 'research'; project: string | null }
/** Gateway resource values, discriminated before rendering. */
export type BrainResource =
  | { kind: 'preferences'; value: Preferences }
  | { kind: 'projects'; value: Project[] }
  | { kind: 'tasks'; value: CentralTask[] }
  | { kind: 'models'; value: Project[] }
  | { kind: 'tools'; value: { status: 'empty' | 'running' | 'complete' | 'failed'; calls: ToolEvidence[] } }
  | { kind: 'privacy'; value: { funde?: number; identitaeten?: number; ersetzungen?: number } | null }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { brain: BrainResource }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'brain/read-failed': Record<string, never> }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid gateway response')
  return value as Record<string, unknown>
}

/** Validate only fields this interface renders.
 * @param kind - Resource route selected by the provider.
 * @param input - Decoded gateway response.
 * @returns A discriminated, validated value.
 */
export function decodeResource(kind: string, input: unknown): BrainResource {
  if (kind === 'projects') {
    const entries = object(input).projekte
    if (!Array.isArray(entries)) throw new Error('Invalid projects')
    return { kind, value: entries.map((entry: unknown) => {
      const row = object(entry)
      if (typeof row.id !== 'string' || typeof row.name !== 'string') throw new Error('Invalid project')
      return { id: row.id, name: row.name }
    }) }
  }
  const row = object(input)
  if (kind === 'tasks') {
    if (!Array.isArray(row.data)) throw new Error('Invalid task catalog')
    return { kind, value: row.data.map(centralTask) }
  }
  if (kind === 'models') {
    if (!Array.isArray(row.modelle)) throw new Error('Invalid model catalog')
    return { kind, value: row.modelle.map((value: unknown) => {
      const model = object(value)
      if (typeof model.id !== 'string' || typeof model.anzeige !== 'string') throw new Error('Invalid model')
      return { id: model.id, name: model.anzeige }
    }) }
  }
  if (kind === 'tools') {
    if (!['empty', 'running', 'complete', 'failed'].includes(String(row.status)) || !Array.isArray(row.calls)) throw new Error('Invalid tool history')
    const calls = row.calls.map((entry: unknown): ToolEvidence => {
      const item = object(entry)
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.arguments !== 'string' || typeof item.output !== 'string'
        || item.status !== 'running' && item.status !== 'completed' && item.status !== 'failed') throw new Error('Invalid tool evidence')
      return { id: item.id, name: item.name, arguments: item.arguments, output: item.output, status: item.status }
    })
    return { kind, value: { status: row.status as 'empty' | 'running' | 'complete' | 'failed', calls } }
  }
  if (kind === 'preferences') {
    if ((row.mode !== 'chat' && row.mode !== 'moa' && row.mode !== 'research') || row.project !== null && typeof row.project !== 'string') throw new Error('Invalid preferences')
    return { kind, value: { mode: row.mode, project: row.project } }
  }
  if (kind === 'privacy') {
    const value: { funde?: number; identitaeten?: number; ersetzungen?: number } = {}
    for (const key of ['funde', 'identitaeten', 'ersetzungen'] as const) {
      if (row[key] === undefined) continue
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0) throw new Error('Invalid privacy count')
      value[key] = row[key]
    }
    return { kind, value }
  }
  throw new Error('Invalid resource route')
}

/** Open account-scoped data under the shared resource model.
 * @returns Provider whose fetch is cancelled when its last reader leaves.
 */
export function brainResources(): ResourceProvider<'brain'> {
  return { protocol: 'brain', async *open(address, { signal }) {
    try {
      const url = new URL(address)
      const [, kind, id] = url.pathname.split('/')
      const path = kind === 'tasks' ? '/_brain/application/zeitplaene/tasks'
        : kind === 'models' ? '/_brain/application/modelle'
          : kind === 'projects' ? '/_brain/application/projekte'
            : kind === 'preferences' && id ? '/_brain/conversations/' + id
              : kind === 'privacy' && id ? '/_brain/privacy/' + id
                : kind === 'tools' && id ? '/_brain/tools/' + id : undefined
      if (!path || !kind) throw new Error('Invalid resource route')
      const response = await fetch(path, { signal, credentials: 'same-origin' })
      if (kind === 'privacy' && response.status === 404) { yield { ok: true, value: { kind, value: null } }; return }
      if (!response.ok) throw new Error('Gateway read failed')
      yield { ok: true, value: decodeResource(kind, await response.json()) }
    } catch (_error: unknown) {
      if (!signal.aborted) yield { ok: false, error: new RemoteError('brain/read-failed', 'Gateway read failed', {}) }
    }
  } }
}
