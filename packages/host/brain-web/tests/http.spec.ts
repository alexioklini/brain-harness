import { createServer } from 'node:http'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { body, json, proxy } from '../src/http.ts'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => { if (error) reject(error); else resolve() })
  })))
})
async function listen(server: Server): Promise<string> {
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test address')
  return `http://127.0.0.1:${address.port}`
}

it('bounds JSON by bytes and rejects non-object input', async () => {
  const origin = await listen(createServer((req, res) => { void (async () => {
    try { json(res, 200, await body(req, 12)) } catch { json(res, 400, { error: 'Invalid input' }) }
  })() }))
  expect((await fetch(origin, { method: 'POST', body: '{"a":"é"}' })).status).toBe(200)
  expect((await fetch(origin, { method: 'POST', body: '{"a":"ééé"}' })).status).toBe(400)
  expect((await fetch(origin, { method: 'POST', body: '[]' })).status).toBe(400)
})

it('uses only the assigned worker cookie and hides internal cookies and redirect origins', async () => {
  const seen: Record<string, unknown>[] = []
  const workerOrigin = await listen(createServer((req, res) => {
    seen.push({ ...req.headers, url: req.url })
    res.writeHead(302, { location: `http://${req.headers.host}/chat`, 'set-cookie': 'private=worker-secret' })
    res.end('worker')
  }))
  const worker = { origin: workerOrigin, cookie: 'private=assigned' }
  const gateway = await listen(createServer((req, res) => { void (async () => {
    try { await proxy(req, res, worker, 1000, AbortSignal.timeout(2000)) }
    catch { if (!res.headersSent) json(res, 502, { error: 'Unavailable' }); else res.destroy() }
  })() }))
  const response = await fetch(gateway + '/?token=attacker', { redirect: 'manual',
    headers: { cookie: 'private=another-user', authorization: 'Bearer injected', 'x-forwarded-host': 'attacker.example' } })
  expect(response.status).toBe(302)
  expect(response.headers.get('location')).toBe('/chat')
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(seen[0]).toMatchObject({ cookie: 'private=assigned', url: '/' })
  expect(seen[0]).not.toHaveProperty('authorization')
  expect(seen[0]).not.toHaveProperty('x-forwarded-host')
  const combo = '/plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=fixture'
  await fetch(gateway + combo, { redirect: 'manual' })
  expect(seen[1]?.url).toBe(combo)
})

it('forwards upgraded streams with only the assigned cookie and closes both sides on cancellation', async () => {
  const { proxyUpgrade } = await import('../src/http.ts')
  const { request } = await import('node:http')
  const sockets: import('node:stream').Duplex[] = []
  const seen: Record<string, unknown>[] = []
  const workerServer = createServer()
  const workerOrigin = await listen(workerServer)
  workerServer.on('upgrade', (req, socket, head) => {
    sockets.push(socket)
    seen.push({ ...req.headers })
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
    if (head.length) socket.write(head)
    socket.pipe(socket)
  })
  const gatewayServer = createServer()
  const gatewayOrigin = await listen(gatewayServer)
  const abort = new AbortController()
  const completions: Promise<void>[] = []
  gatewayServer.on('upgrade', (req, socket, head) => {
    sockets.push(socket)
    completions.push(proxyUpgrade(req, socket, head, { origin: workerOrigin, cookie: 'private=own' }, abort.signal))
  })
  try {
    const pending = request(gatewayOrigin + '/api/remote.mux', { headers: {
      connection: 'Upgrade', upgrade: 'websocket', cookie: 'private=other', authorization: 'Bearer other',
    } })
    const upgraded = once(pending, 'upgrade')
    pending.end()
    const [, socket] = await upgraded as [unknown, import('node:stream').Duplex, Buffer]
    sockets.push(socket)
    const echoed = once(socket, 'data')
    socket.write('fixture stream')
    expect(String((await echoed)[0])).toBe('fixture stream')
    expect(seen[0]).toMatchObject({ cookie: 'private=own', origin: workerOrigin })
    expect(seen[0]).not.toHaveProperty('authorization')
    const closed = once(socket, 'close')
    abort.abort()
    await closed
    await Promise.all(completions)
  } finally {
    abort.abort()
    for (const socket of sockets) socket.destroy()
    await Promise.all(completions)
  }
})

it('ignores event-only SSE frames but preserves data, comments and malformed JSON for the protocol consumer', async () => {
  const { relayResponses } = await import('../src/http.ts')
  const input = ': pending\n\nevent: response.output_text.done\n\nevent: response.completed\ndata: {"type":"response.completed"}\n\ndata: malformed\n\n'
  const gateway = await listen(createServer((_req, res) => {
    void relayResponses(new Response(input, { headers: { 'content-type': 'text/event-stream' } }), res, AbortSignal.timeout(2000), 1024)
  }))
  const result = await (await fetch(gateway)).text()
  expect(result).not.toContain('response.output_text.done')
  expect(result).toContain('event: response.completed\ndata: {"type":"response.completed"}')
  expect(result).toContain(': keepalive')
  expect(result).toContain('data: malformed')
})
