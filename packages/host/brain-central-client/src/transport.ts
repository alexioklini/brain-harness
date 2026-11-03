/** Bounded host-only JSON transport shared by Brain account and Router clients. @module */
import { BrainServiceError } from './values.ts'
import type { CentralObject } from './values.ts'

/** Host-owned endpoint, authentication and request bounds. */
export interface JSONConnection {
  baseURL: string
  headers: () => Record<string, string> | Promise<Record<string, string>>
  timeoutMs: number
  maxResponseBytes: number
}

/** No redirects, cached credentials or fallback responses. */
export class JSONTransport {
  private readonly base: URL

  constructor(private readonly connection: JSONConnection) {
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
   * @returns Decoded JSON value and response headers.
   */
  async request(path: string, body?: CentralObject, signal?: AbortSignal): Promise<{ data: unknown; headers: Headers }> {
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path)
      || path.split('/').some(part => part === '.' || part === '..' || part.includes('%'))) {
      throw new Error('Invalid central API path')
    }
    const headers = await this.connection.headers()
    const deadline = AbortSignal.timeout(this.connection.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    const response = await fetch(new URL(path.slice(1), this.base), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
      redirect: 'error', signal: combined,
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new BrainServiceError(response.status)
    }
    const value = await readBoundedJSON(response, this.connection.maxResponseBytes)

    return { data: value, headers: response.headers }
  }

}

/** Decode a bounded UTF-8 JSON response and always release its reader.
 * @param response - Service response with a body.
 * @param limit - Maximum response bytes.
 * @returns Parsed untrusted JSON value.
 */
export async function readBoundedJSON(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty central service response')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > limit) throw new Error('Central response exceeds size limit')
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
  return value
}
