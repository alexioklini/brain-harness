/** Authenticated Brain service transport; never executes tools on the web host. @module */

/** JSON object received from a central service. */
export type CentralObject = Record<string, unknown>

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

/** Parse an external object without accepting null or arrays.
   * @param value - Untrusted decoded JSON.
   * @returns Validated object.
   */
export function centralObject(value: unknown): CentralObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid central service response')
  }
  return value as CentralObject
}

/** HTTP failure with a safe message; service bodies and credentials are excluded. */
export class BrainServiceError extends Error {
  constructor(readonly status: number) {
    super(`Central service request failed (${status})`)
    this.name = 'BrainServiceError'
  }
}

/** Central APIs shared by the model, tool and privacy integrations. */
export class BrainCentralClient {
  private readonly base: URL

  constructor(private readonly connection: BrainConnection) {
    this.base = new URL(connection.baseURL.replace(/\/$/, '') + '/')
    if (this.base.username || this.base.password || this.base.search || this.base.hash
      || (this.base.protocol !== 'https:' && !(this.base.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(this.base.hostname)))) {
      throw new Error('Brain requires HTTPS or a loopback endpoint')
    }
    if (!Number.isSafeInteger(connection.timeoutMs) || connection.timeoutMs <= 0
      || !Number.isSafeInteger(connection.maxResponseBytes) || connection.maxResponseBytes <= 0) {
      throw new Error('Invalid Brain request limits')
    }
  }

  /** Fetch JSON without redirects, credential leakage or stale response fallback.
   * @param path - Relative API path.
   * @param body - Optional JSON request body.
   * @param signal - Caller cancellation.
   * @returns Decoded response object.
   */
  async request(path: string, body?: CentralObject, signal?: AbortSignal): Promise<CentralObject> {
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)
      || path.split('/').some(part => part === '.' || part === '..' || part.includes('%'))) {
      throw new Error('Invalid central API path')
    }
    const key = await this.connection.credential()
    if (!key) throw new Error('Brain sign-in required')
    const deadline = AbortSignal.timeout(this.connection.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    const response = await fetch(new URL(path.slice(1), this.base), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
      redirect: 'error', signal: combined,
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new BrainServiceError(response.status)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Empty central service response')
    const chunks: Uint8Array[] = []
    let length = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        length += chunk.value.byteLength
        if (length > this.connection.maxResponseBytes) throw new Error('Central response exceeds size limit')
        chunks.push(chunk.value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let value: unknown
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new Error('Invalid central service JSON') }
    return centralObject(value)
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
