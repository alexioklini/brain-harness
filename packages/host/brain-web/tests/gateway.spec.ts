/** Loader composition exercises the real gateway and HTTP providers. */
import { request } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Subprocess from '@deepseek-ai/dsh-subprocess-local'
import Sandbox from '@deepseek-ai/dsh-sandbox-local'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import * as Gateway from '../src/index.ts'

async function get(url: string, init: { headers?: Record<string, string>; method?: string; body?: string } = {}) {
  return await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = request(url, { method: init.method, headers: init.headers }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => { text += chunk })
      response.on('error', reject)
      response.on('end', () => { resolve({ status: response.statusCode ?? 0, text }) })
    })
    req.on('error', reject)
    req.end(init.body)
  })
}

const owned: { ctx: Context; root: string }[] = []
afterEach(async () => {
  for (const { ctx, root } of owned.splice(0)) {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

async function composition() {
  const root = await mkdtemp(join(tmpdir(), 'brain-gateway-test-'))
  const ctx = new Context()
  owned.push({ ctx, root })
  const index = join(root, 'brain-login.html')
  await writeFile(index, '<html><title>Sign in</title></html>')
  const path = join(root, 'cordis.yml')
  await writeFile(path, JSON.stringify([
    { name: 'cordis:webserver', config: { host: '127.0.0.1', port: 0 } },
    { name: 'cordis:credentials' }, { name: 'cordis:subprocess' }, { name: 'cordis:sandbox' },
    { name: 'cordis:brain', config: {
      publicURL: 'https://brain-harness.example', brainURL: 'http://127.0.0.1:1', routerURL: 'http://127.0.0.1:1',
      routerCredential: 'FIXTURE', storageRoot: join(root, 'users'), cliBin: '/unused', workerPatch: '/unused',
      nodeBin: '/unused', defaultModel: 'fixture', maxUsers: 2, maxLogins: 8, sessionMs: 60000, startupTimeoutMs: 1000,
      requestTimeoutMs: 1000, maxBodyBytes: 4096, shutdownGraceMs: 100, loginIndex: index, workerReadableRoots: [],
    } },
  ]))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, { include: Include, webserver: WebServer, credentials: MemoryCredentials,
    subprocess: Subprocess, sandbox: Sandbox, brain: Gateway })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  return { ctx, url: ctx.webServer.getOrigin() }
}

it('serves sign-in while withholding application and Router access', async () => {
  const { url } = await composition()
  const headers = { host: 'brain-harness.example' }
  const login = await get(url, { headers })
  expect(login.status).toBe(200)
  expect(login.text).toContain('<title>Sign in</title>')
  expect((await get(url + '/api', { headers })).status).toBe(401)
  expect((await get(url + '/_brain/application/projekte', { headers })).status).toBe(401)
  expect((await get(url + '/_brain/router/v1/models', { headers })).status).toBe(401)
})

it('rejects foreign hosts and cross-origin sign-in before contacting Brain', async () => {
  const { url } = await composition()
  expect((await get(url, { headers: { host: 'foreign.example' } })).status).toBe(403)
  const result = await get(url + '/_brain/login', { method: 'POST',
    headers: { host: 'brain-harness.example', origin: 'https://foreign.example' }, body: '{}' })
  expect(result.status).toBe(403)
})
