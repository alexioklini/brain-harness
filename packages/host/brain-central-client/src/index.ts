/** Authenticated Brain service transport; never executes tools on the web host. @module */

import { JSONTransport } from './transport.ts'
import { centralObject } from './values.ts'
import type { CentralObject } from './values.ts'
export { centralObject, BrainServiceError } from './values.ts'
export type { CentralObject } from './values.ts'
export { readBoundedJSON } from './transport.ts'
export { BrainAccountClient } from './account.ts'
export type { BrainAccount, BrainAccountSession } from './account.ts'

/** Deployment-owned connection settings; credentials remain on the host. */
export interface BrainConnection {
  baseURL: string
  credential: () => Promise<string>
  timeoutMs: number
  maxResponseBytes: number
}

/** Session identifiers used consistently by tools, privacy and inference. */
export interface BrainSession {
  session: string
  model: string
  harness: string
}

/** Central APIs shared by the model, tool and privacy integrations. */
export class BrainCentralClient {
  private readonly transport: JSONTransport

  constructor(connection: BrainConnection) {
    this.transport = new JSONTransport({ ...connection, headers: async () => {
      const key = await connection.credential()
      if (!key) throw new Error('Brain sign-in required')
      return { authorization: `Bearer ${key}` }
    } })
  }

  /** Fetch one authenticated JSON response.
   * @param path - Relative API path.
   * @param body - Optional JSON request body.
   * @param signal - Caller cancellation.
   * @returns Decoded service response.
   */
  async request(path: string, body?: CentralObject, signal?: AbortSignal): Promise<CentralObject> {
    return centralObject((await this.transport.request(path, body, signal)).data)
  }

  /** Retrieve the current authorized model catalog; an outage remains an error.
   * @param signal - Caller cancellation.
   * @returns Current service-issued models.
   */
  async models(signal?: AbortSignal): Promise<CentralObject[]> {
    const result = await this.request('/models', undefined, signal)
    if (!Array.isArray(result.data)) throw new Error('Missing central model catalog')
    return result.data.map(centralObject)
  }

  /** Prepare a web turn with all execution delegated to central services.
   * @param session - Owned session context.
   * @param prompt - Current user request.
   * @param signal - Caller cancellation.
   * @returns Current selection and catalog.
   */
  async prepare(session: BrainSession, prompt: string, signal?: AbortSignal): Promise<CentralObject> {
    const result = await this.request('/tools/prepare', {
      session: session.session, model: session.model, prompt,
      local_workspace_tools: false, skill_loading: 1,
      context: { connector_harness_id: session.harness },
    }, signal)
    const catalog = centralObject(result.catalog)
    for (const field of ['tools', 'skills', 'servers']) {
      if (!Array.isArray(catalog[field])) throw new Error('Incomplete central tool catalog')
    }
    const trace = centralObject(result.trace)
    if (trace.schema_version !== 'router.tools.selection.v1') throw new Error('Invalid central selection')
    return result
  }

  /** Execute the service-issued tool identifier under current server grants.
   * @param session - Owned session context.
   * @param toolId - Identifier from the current catalog.
   * @param args - Arguments matching the service schema.
   * @param signal - Caller cancellation.
   * @returns Central execution result.
   */
  call(session: BrainSession, toolId: string, args: CentralObject, signal?: AbortSignal): Promise<CentralObject> {
    return this.request('/tools', {
      method: 'call_tool', session: session.session, model: session.model,
      arguments: { tool_id: toolId, arguments: args },
      context: { connector_harness_id: session.harness },
    }, signal)
  }

  /** Read privacy facts without interpreting missing measurements as zero.
   * @param session - Owned session identifier.
   * @param signal - Caller cancellation.
   * @returns Service-issued privacy facts.
   */
  privacy(session: string, signal?: AbortSignal): Promise<CentralObject> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(session)) throw new Error('Invalid Brain session')
    return this.request(`/privacy/sessions/${session}`, undefined, signal)
  }
}
