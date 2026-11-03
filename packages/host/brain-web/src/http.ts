/** Bounded HTTP input and streaming loopback proxy for isolated Harness workers. @module */
import { request } from 'node:http'
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http'
import { once } from 'node:events'
import { createParser } from 'eventsource-parser'
import type { Duplex } from 'node:stream'
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
  if (target.searchParams.has('token')) target.searchParams.delete('token')
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

/** Forward an authenticated WebSocket handshake and its opaque stream to one worker.
 * @param req - Origin-checked, authenticated upgrade request.
 * @param socket - Browser connection, owned until either side closes.
 * @param head - Bytes received after the browser handshake.
 * @param worker - Assigned account process and private cookie.
 * @param signal - Login expiry, logout, shutdown, or connection deadline.
 * @returns Completion after both connections have been destroyed.
 */
export async function proxyUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer,
  worker: Pick<UserWorker, 'origin' | 'cookie'>, signal: AbortSignal): Promise<void> {
  const target = new URL(req.url ?? '/', worker.origin)
  if (target.origin !== worker.origin || target.search) throw new Error('Invalid upgrade path')
  // Only WebSocket negotiation headers cross the gateway; browser credentials do not.
  const headers: OutgoingHttpHeaders = { host: target.host, origin: target.origin, cookie: worker.cookie,
    connection: 'Upgrade', upgrade: 'websocket' }
  for (const key of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
    if (req.headers[key] !== undefined) headers[key] = req.headers[key]
  }
  const pending = Promise.withResolvers<void>()
  let peer: Duplex | undefined
  const upstream = request(target, { headers, signal })
  const close = (): void => {
    upstream.destroy()
    peer?.destroy()
    socket.destroy()
    pending.resolve()
  }
  socket.once('close', close)
  socket.once('error', close)
  upstream.once('error', close)
  upstream.once('response', (reply) => { reply.destroy(); close() })
  upstream.once('upgrade', (reply, connection, upstreamHead) => {
    peer = connection
    if (socket.destroyed || signal.aborted) { close(); return }
    const response = ['HTTP/1.1 101 Switching Protocols', 'Connection: Upgrade', 'Upgrade: websocket']
    for (const key of ['sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
      const value = reply.headers[key]
      if (typeof value === 'string') response.push(`${key}: ${value}`)
    }
    socket.write(response.join('\r\n') + '\r\n\r\n')
    connection.once('close', close)
    connection.once('error', close)
    if (upstreamHead.length) socket.write(upstreamHead)
    if (head.length) connection.write(head)
    socket.pipe(connection).pipe(socket)
  })
  signal.addEventListener('abort', close, { once: true })
  if (signal.aborted) close()
  else upstream.end()
  try { await pending.promise } finally {
    signal.removeEventListener('abort', close)
    socket.off('close', close)
    socket.off('error', close)
  }
}

/** Relay Responses SSE with standard event dispatch: headers without data are not events.
 * @param response - Router response; non-SSE responses retain normal relay behavior.
 * @param res - Worker response.
 * @param signal - Request lifetime.
 * @param maxFrameBytes - Maximum buffered event size.
 */
export async function relayResponses(response: Response, res: ServerResponse, signal: AbortSignal, maxFrameBytes: number): Promise<void> {
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    await relay(response, res, signal)
    return
  }
  res.writeHead(response.status, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
  let frames: string[] = []
  const parser = createParser({ maxBufferSize: maxFrameBytes,
    onEvent: (event) => {
      frames.push((event.event ? `event: ${event.event}\n` : '')
        + event.data.split('\n').map(line => `data: ${line}`).join('\n') + '\n\n')
    },
    onComment: () => { frames.push(': keepalive\n\n') },
    onError: (error) => { throw error },
  })
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for await (const chunk of response.body) {
    signal.throwIfAborted()
    parser.feed(decoder.decode(chunk, { stream: true }))
    for (const frame of frames) if (!res.write(frame)) await once(res, 'drain', { signal })
    frames = []
  }
  parser.feed(decoder.decode())
  for (const frame of frames) if (!res.write(frame)) await once(res, 'drain', { signal })
  res.end()
}
