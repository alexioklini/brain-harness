/** Brain account authentication and account-owned request context. @module */
import { createHash } from 'node:crypto'
import type { Branded } from '@deepseek-ai/dsh-brand'
import { JSONTransport } from './transport.ts'
import type { JSONConnection } from './transport.ts'
import { centralObject } from './values.ts'
import type { CentralObject } from './values.ts'

/** Account identifier issued by Brain. */
export type BrainAccountId = Branded<'BrainAccountId'>
/** Team identifier issued by Brain. */
export type BrainTeamId = Branded<'BrainTeamId'>

/** Current identity, obtained from Brain rather than browser-supplied claims. */
export interface BrainAccount {
  readonly id: BrainAccountId
  readonly name: string
  readonly teams: readonly BrainTeamId[]
}

function account(value: CentralObject): BrainAccount {
  const user = centralObject(value.benutzer)
  if (typeof user.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(user.id)
    || typeof user.anzeigename !== 'string' || !Array.isArray(user.teams)
    || !user.teams.every((team): team is string => typeof team === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(team))) {
    throw new Error('Invalid Brain account response')
  }
  return { id: user.id as BrainAccountId, name: user.anzeigename, teams: user.teams as BrainTeamId[] }
}

function digest(value: string): string { return createHash('sha256').update(value).digest('hex') }

/** A server-owned Brain login; never expose this object or its cookie to a browser. */
export interface BrainAccountSession {
  /** Stable directory component for a separate user runtime and storage root. */
  readonly storageKey: string
  /** Revalidate identity and project membership; no cached permission fallback.
   * @param chat - Runtime-owned chat identifier.
   * @param project - Selected project identifier, checked through Brain.
   * @param signal - Caller cancellation.
   * @returns Current account and server-derived Router context.
   */
  authorize(chat: string, project?: string, signal?: AbortSignal): Promise<{
    account: BrainAccount
    principal: string
    session: string
    context: { teams: readonly string[]; project?: string }
  }>
  /** Forget the local login immediately; subsequent requests must sign in again. */
  close(): void
}

/** Authenticate existing Brain users without creating another account database. */
export class BrainAccountClient {
  constructor(private readonly connection: Omit<JSONConnection, 'headers'>) {}

  /** Exchange credentials for a server-owned account session.
   * @param username - Existing Brain login name.
   * @param password - Password used only for this request.
   * @param signal - Caller cancellation.
   * @returns Account-scoped authorization capability with no exported cookie.
   */
  async login(username: string, password: string, signal?: AbortSignal): Promise<BrainAccountSession> {
    const transport = new JSONTransport({ ...this.connection, headers: () => ({}) })
    const result = await transport.request('/api/anmeldung', { anmeldename: username, passwort: password }, signal)
    const owner = account(result.data)
    const cookies = result.headers.getSetCookie().filter(value => value.startsWith('fmsitzung='))
    if (cookies.length !== 1) throw new Error('Brain session cookie is missing or ambiguous')
    const cookieValue = cookies[0]?.match(/^(fmsitzung=[a-f0-9]{64})(?:;|$)/)?.[1]
    if (!cookieValue) throw new Error('Invalid Brain session cookie')
    let cookie: string | undefined = cookieValue
    const authenticated = new JSONTransport({ ...this.connection, headers: () => {
      if (!cookie) throw new Error('Brain sign-in required')
      return { cookie }
    } })
    return {
      storageKey: `user-${digest(owner.id)}`,
      close: () => { cookie = undefined },
      authorize: async (chat, project, abort) => {
        if (!chat || chat.length > 256) throw new Error('Invalid Brain chat identifier')
        if (project !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(project)) throw new Error('Invalid Brain project')
        const current = account((await authenticated.request('/api/ich', undefined, abort)).data)
        if (!cookie || current.id !== owner.id) throw new Error('Brain account changed; sign in again')
        if (project !== undefined) {
          await authenticated.request(`/api/projekte/${project}`, undefined, abort)
          if (!cookie) throw new Error('Brain sign-in required')
        }
        return { account: current, principal: `fm-user-${owner.id}`,
          session: `brain-harness-${digest(owner.id + '\0' + chat)}`,
          context: { teams: current.teams, ...project === undefined ? {} : { project } } }
      },
    }
  }
}
