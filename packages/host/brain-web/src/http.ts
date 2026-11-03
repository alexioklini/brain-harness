/** Bounded HTTP input and streaming loopback proxy for isolated Harness workers. @module */
import { request } from 'node:http'
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http'
import { once } from 'node:events'
import type { UserWorker } from './types.ts'

/** Read one bounded JSON object.
 * @param req - Incoming browser or worker request.
 * @param limit - Maximum request bytes.
 * @returns Parsed JSON object.
 */
export async function body(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const parts: Uint8Array[] = []
  let size = 0
  for await (const part of req as AsyncIterable<unknown>) {
    if (!(part instanceof Uint8Array)) throw new Error('Invalid request bytes')
    const bytes = part
    size += bytes.length
    if (size > limit) throw new Error('Request too large')
    parts.push(bytes)
  }
  const value: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required')
  return value as Record<string, unknown>
}

/** Send a private JSON response.
 * @param res - Browser response.
 * @param status - HTTP status.
 * @param value - Display-safe result.
 */
export function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

/** Copy a Fetch response with backpressure and caller cancellation.
 * @param response - Upstream service response.
 * @param res - Downstream response.
 * @param signal - Request cancellation.
 */
export async function relay(response: Response, res: ServerResponse, signal: AbortSignal): Promise<void> {
  res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  if (response.body) for await (const chunk of response.body) {
    signal.throwIfAborted()
    if (!res.write(chunk)) await once(res, 'drain', { signal })
  }
  res.end()
}

/** Proxy a browser request into only its assigned loopback process.
 * @param req - Authenticated browser request.
 * @param res - Browser response.
 * @param worker - Account-owned process.
 * @param maxBytes - Upload limit.
 * @param signal - Browser cancellation.
 */
export async function proxy(req: IncomingMessage, res: ServerResponse, worker: Pick<UserWorker, 'origin' | 'cookie'>, maxBytes: number, signal: AbortSignal): Promise<void> {
  const target = new URL(req.url ?? '/', worker.origin)
  if (target.origin !== worker.origin) throw new Error('Invalid application path')
  target.searchParams.delete('token')
  const headers: OutgoingHttpHeaders = { ...req.headers, host: target.host, origin: target.origin, cookie: worker.cookie }
  delete headers.authorization
  delete headers['x-forwarded-host']
  delete headers['x-forwarded-for']
  delete headers['x-forwarded-proto']
  const pending = Promise.withResolvers<void>()
  const upstream = request(target, { method: req.method, headers, signal }, (reply) => {
    const outgoing = { ...reply.headers, 'cache-control': 'no-store' }
    delete outgoing['set-cookie']
    if (outgoing.location?.startsWith(worker.origin)) outgoing.location = outgoing.location.slice(worker.origin.length) || '/'
    res.writeHead(reply.statusCode ?? 502, outgoing)
    reply.on('error', pending.reject)
    reply.on('end', pending.resolve)
    reply.pipe(res)
  })
  upstream.on('error', pending.reject)
  // Observe failures before streaming the upload so an early rejection is handled.
  void pending.promise.catch((_error: unknown) => { /* The upload owner awaits and propagates this rejection below. */ })
  try {
    let bytes = 0
    for await (const chunk of req as AsyncIterable<unknown>) {
      if (!(chunk instanceof Uint8Array)) throw new Error('Invalid request bytes')
      bytes += chunk.byteLength
      if (bytes > maxBytes) throw new Error('Request too large')
      if (!upstream.write(chunk)) await once(upstream, 'drain', { signal })
    }
    upstream.end()
    await pending.promise
  } catch (error) {
    upstream.destroy()
    throw error
  }
}
