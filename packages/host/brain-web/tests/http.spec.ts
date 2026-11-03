import { createServer } from 'node:http'
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
})
