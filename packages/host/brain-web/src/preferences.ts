/** Account-private conversation choices, separate from worker-readable storage. @module */
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { centralObject, BrainServiceError } from '@deepseek-ai/dsh-brain-central-client'

/** User choices that affect central inference authorization and routing. */
export interface ConversationPreferences {
  mode: 'chat' | 'moa' | 'research'
  project: string | null
}

/** Validate a complete browser or persisted preference record.
 * @param value - Untrusted JSON.
 * @returns Validated conversation choices.
 */
export function conversationPreferences(value: unknown): ConversationPreferences {
  const input = centralObject(value)
  if ((input.mode !== 'chat' && input.mode !== 'moa' && input.mode !== 'research')
    || input.project !== null && (typeof input.project !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.project))
    || Object.keys(input).some(key => key !== 'mode' && key !== 'project')) throw new BrainServiceError(400)
  return { mode: input.mode, project: input.project }
}

/** Bounded account preference storage; workers cannot read this sibling directory. */
export class ConversationStore {
  constructor(private readonly root: string, private readonly maxBytes: number) {}

  private path(account: string, suffix = ''): string {
    if (!/^user-[a-f0-9]{64}$/.test(account)) throw new Error('Invalid account storage key')
    return join(this.root, '.gateway', account + suffix + '.json')
  }

  private key(chat: string): string {
    if (!chat || chat.length > 256) throw new BrainServiceError(400)
    return createHash('sha256').update(chat).digest('hex')
  }

  private async records(path: string): Promise<Record<string, unknown>> {
    let size: number
    try { size = (await stat(path)).size } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}
      throw error
    }
    if (size > this.maxBytes) throw new BrainServiceError(413)
    return centralObject(JSON.parse(await readFile(path, 'utf8')))
  }

  /** Read only this account's conversation preferences.
   * @param account - Verified account storage key.
   * @param chat - Harness conversation identifier.
   * @returns Stored choices, or explicit new-conversation defaults.
   */
  async get(account: string, chat: string): Promise<ConversationPreferences> {
    const key = this.key(chat)
    const records = await this.records(this.path(account))
    return records[key] === undefined ? { mode: 'chat', project: null } : conversationPreferences(records[key])
  }

  /** Persist one authorized change without losing concurrent changes.
   * @param account - Verified account storage key.
   * @param chat - Harness conversation identifier.
   * @param value - Complete validated choices.
   * @param signal - Request cancellation.
   */
  async set(account: string, chat: string, value: ConversationPreferences, signal: AbortSignal): Promise<void> {
    await this.update(this.path(account), this.key(chat), value, signal)
  }


  /** Read the most recent request's central-tool evidence for this conversation.
   * @param account - Verified account storage key.
   * @param chat - Harness conversation identifier.
   * @returns Stored evidence or an explicit empty history.
   */
  async tools(account: string, chat: string): Promise<unknown> {
    return (await this.records(this.path(account, '.tools')))[this.key(chat)] ?? { status: 'empty', calls: [] }
  }

  /** Persist central-tool evidence separately from user preferences.
   * @param account - Verified account storage key.
   * @param chat - Harness conversation identifier.
   * @param value - Gateway-owned request status and service evidence.
   * @param signal - Request cancellation.
   */
  async recordTools(account: string, chat: string, value: unknown, signal: AbortSignal): Promise<void> {
    await this.update(this.path(account, '.tools'), this.key(chat), value, signal)
  }

  private async update(path: string, key: string, value: unknown, signal: AbortSignal): Promise<void> {
    await mkdir(join(this.root, '.gateway'), { recursive: true, mode: 0o700 })
    await withFileLock(path, async () => {
      const records = await this.records(path)
      if (path.endsWith('.tools.json')) {
        const next = centralObject(value)
        if (next.status !== 'running' && records[key] !== undefined && centralObject(records[key]).turn !== next.turn) return
      }
      records[key] = value
      const serialized = JSON.stringify(records)
      if (Buffer.byteLength(serialized) > this.maxBytes) throw new BrainServiceError(413)
      signal.throwIfAborted()
      await writeFileAtomic(path, serialized, { mode: 0o600, dirMode: 0o700 })
    }, { signal })
  }
}
