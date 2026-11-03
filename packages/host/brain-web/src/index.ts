/** Brain login, user runtime isolation and central-service request authorization. @module */
import { randomBytes, createHash } from 'node:crypto'
import { dirname } from 'node:path'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-sandbox'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BrainAccountClient, BrainServiceError, centralObject } from '@deepseek-ai/dsh-brain-central-client'
import type { BrainAccountSession } from '@deepseek-ai/dsh-brain-central-client'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { serveStatic } from '@deepseek-ai/dsh-host-frontend-static'
import { UserWorkers } from './workers.ts'
import type { GatewayConfig, UserWorker } from './types.ts'
import { basicCredentials } from './basic.ts'
import { body, json, proxy, relay } from './http.ts'

/** Gateway deployment configuration. */
export const Config = z.object({
  publicURL: z.string().required(), brainURL: z.string().required(), routerURL: z.string().required(),
  routerCredential: z.string().role('credential-ref').required(), storageRoot: z.string().required(),
  cliBin: z.string().required(), workerPatch: z.string().required(), nodeBin: z.string().required(),
  defaultModel: z.string().required(), maxUsers: z.number().step(1).min(1).required(),
  maxLogins: z.number().step(1).min(1).required(),
  sessionMs: z.number().step(1).min(1).required(), startupTimeoutMs: z.number().step(1).min(1).required(),
  requestTimeoutMs: z.number().step(1).min(1).required(), maxBodyBytes: z.number().step(1).min(1).required(),
  shutdownGraceMs: z.number().step(1).min(1).required(),
  loginIndex: z.string().required(),
  workerReadableRoots: z.array(z.string()).required(),
})
/** Stable gateway plugin name. */
export const name = 'brain-web'
/** Host services required before accepting requests. */
export const inject = ['webServer', 'subprocess', 'credentials', 'sandbox']

interface Login { account: BrainAccountSession; worker: UserWorker; expires: number }
const cookieName = '__Host-brain-harness'
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Mount the account gateway under Cordis lifecycle ownership.
 * @param ctx - Gateway services; no agent runtime is mounted in this context.
 * @param config - Deployment-owned addresses, paths and limits.
 */
export function apply(ctx: Context, config: GatewayConfig): void {
  const publicURL = new URL(config.publicURL)
  const routerURL = new URL(config.routerURL.endsWith('/') ? config.routerURL : config.routerURL + '/')
  const localPreview = publicURL.protocol === 'http:' && publicURL.hostname === '127.0.0.1'
  if (publicURL.protocol !== 'https:' && !localPreview || publicURL.pathname !== '/' || publicURL.search || publicURL.hash
    || publicURL.username || publicURL.password) throw new Error('Public URL must be HTTPS or HTTP loopback')
  if (routerURL.protocol !== 'https:' && !(routerURL.protocol === 'http:' && routerURL.hostname === '127.0.0.1')) {
    throw new Error('Router requires HTTPS or loopback')
  }
  if (routerURL.pathname !== '/' || routerURL.search || routerURL.hash || routerURL.username || routerURL.password) {
    throw new Error('Router URL must be an origin')
  }
  const accounts = new BrainAccountClient({ baseURL: config.brainURL,
    timeoutMs: config.requestTimeoutMs, maxResponseBytes: config.maxBodyBytes })
  const workers = new UserWorkers(ctx, config, () => ctx.webServer.getOrigin())
  const logins = new Map<string, Login>()
  const credential = credentialRef(config.routerCredential)
  ctx.effect(() => async () => {
    for (const login of logins.values()) login.account.close()
    logins.clear()
    await workers.close()
  })
  ctx.effect(() => ctx.webServer.registerFallback(async (req, res) => {
    const cancellation = new AbortController()
    const abort = (): void => { if (!res.writableEnded) cancellation.abort() }
    req.once('aborted', abort)
    res.once('close', abort)
    const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(config.requestTimeoutMs)])
    try {
      const url = new URL(req.url ?? '/', publicURL)
      if (url.origin !== publicURL.origin) { json(res, 400, { error: 'Invalid request' }); return }
      if (url.pathname.startsWith('/_brain/router/')) {
        const worker = await workers.byToken(req.headers.authorization?.replace(/^Bearer /, '') ?? '')
        if (!worker) { json(res, 401, { error: 'Sign in required' }); return }
        const path = url.pathname.slice('/_brain/router/'.length)
        if (!['v1/models', 'v1/tools/policy', 'v1/responses'].includes(path)) {
          json(res, 404, { error: 'Not found' }); return
        }
        if (url.search || req.method !== (path === 'v1/responses' ? 'POST' : 'GET')) {
          json(res, 405, { error: 'Method not allowed' }); return
        }
        const payload = req.method === 'POST' ? await body(req, config.maxBodyBytes) : undefined
        const metadata = payload?.metadata === undefined ? {} : centralObject(payload.metadata)
        const chat = metadata.llmrouter_pii_session
        if (payload && (typeof chat !== 'string' || !chat)) { json(res, 400, { error: 'Chat required' }); return }
        const scope = await worker.account.authorize(typeof chat === 'string' ? chat : 'catalog', undefined, signal)
        if (payload) {
          if (payload.previous_response_id || payload.conversation || payload.background) throw new Error('Explicit chat history required')
          payload.tools = []
          payload.store = false
          delete payload.client_metadata
          payload.metadata = { llmrouter_pii_session: scope.session, llmrouter_tools_session: scope.session,
            llmrouter_tools_principal: scope.principal, llmrouter_tools_context: scope.context,
            llmrouter_rag_principal: scope.principal, llmrouter_rag_context: JSON.stringify(scope.context),
            llmrouter_pii_source: 'brain-harness', llmrouter_context_policy: 'brain-v1' }
        }
        const key = (await ctx.credentials.resolve(credential))?.value
        if (!key) throw new Error('Router credential unavailable')
        const target = new URL(path, routerURL)
        const response = await fetch(target, { method: payload ? 'POST' : 'GET', redirect: 'error', signal,
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json',
            'x-rag-principal': scope.principal, 'x-rag-context': JSON.stringify(scope.context) },
          ...payload ? { body: JSON.stringify(payload) } : {} })
        await relay(response, res, signal)
        return
      }
      if (req.headers.host !== publicURL.host || req.headers.origin && req.headers.origin !== publicURL.origin) {
        json(res, 403, { error: 'Invalid origin' }); return
      }
      for (const [key, login] of logins) {
        if (login.expires <= Date.now()) { login.account.close(); logins.delete(key) }
      }
      const basic = basicCredentials(req.headers.authorization)
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== publicURL.origin && !basic) {
        json(res, 403, { error: 'Invalid origin' }); return
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/assets/')) {
        await relay(await serveStatic(new Request(url, { method: req.method }), dirname(config.loginIndex),
          config.loginIndex, () => undefined, html => html), res, signal)
        return
      }
      if (url.pathname === '/_brain/login' && req.method === 'POST') {
        if (logins.size >= config.maxLogins) throw new BrainServiceError(503)
        const value = await body(req, config.maxBodyBytes)
        if (typeof value.username !== 'string' || typeof value.password !== 'string') {
          json(res, 400, { error: 'Username and password required' }); return
        }
        const account = await accounts.login(value.username, value.password, signal)
        let worker: UserWorker
        try {
          worker = await workers.acquire(account)
          if (logins.size >= config.maxLogins) throw new BrainServiceError(503)
        } catch (error) { account.close(); throw error }
        const token = randomBytes(32).toString('hex')
        logins.set(hash(token), { account, worker, expires: Date.now() + config.sessionMs })
        res.setHeader('set-cookie', `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(config.sessionMs / 1000)}`)
        json(res, 200, { signedIn: true })
        return
      }
      const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(cookieName + '='))
      const token = cookies.length === 1 ? cookies[0]?.slice(cookieName.length + 1) : undefined
      const loginKey = basic ? 'basic-' + hash(req.headers.authorization ?? '') : token ? hash(token) : undefined
      let login = loginKey ? logins.get(loginKey) : undefined
      if (login && login.expires <= Date.now()) {
        login.account.close()
        if (loginKey) logins.delete(loginKey)
        login = undefined
      }
      if (!login && basic && loginKey) {
        if (logins.size >= config.maxLogins) throw new BrainServiceError(503)
        const account = await accounts.login(basic.username, basic.password, signal)
        let worker: UserWorker
        try {
          worker = await workers.acquire(account)
          if (logins.size >= config.maxLogins) throw new BrainServiceError(503)
        } catch (error) { account.close(); throw error }
        login = { account, worker, expires: Date.now() + config.sessionMs }
        logins.set(loginKey, login)
      }
      if (!login) {
        if (req.method === 'GET' && url.pathname === '/') {
          await relay(await serveStatic(new Request(publicURL), dirname(config.loginIndex), config.loginIndex,
            () => undefined, html => html), res, signal)
          return
        }
        json(res, 401, { error: 'Sign in required' }); return
      }
      if (url.pathname === '/_brain/logout' && req.method === 'POST') {
        login.account.close()
        if (loginKey) logins.delete(loginKey)
        res.setHeader('set-cookie', `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`)
        json(res, 200, { signedIn: false })
        return
      }
      await login.account.authorize('web-request', undefined, signal)
      login.worker.account = login.account
      if (url.pathname.startsWith('/_brain/application/')) {
        if (req.method !== 'GET' && req.method !== 'POST' || url.search) {
          json(res, 405, { error: 'Method not allowed' }); return
        }
        const path = '/api/' + url.pathname.slice('/_brain/application/'.length)
        const value = await login.account.request(path, req.method === 'POST' ? await body(req, config.maxBodyBytes) : undefined, signal)
        json(res, 200, value)
        return
      }
      await proxy(req, res, login.worker, config.maxBodyBytes, signal)
    } catch (error) {
      if (res.headersSent) { res.destroy(); return }
      json(res, error instanceof BrainServiceError ? error.status : 502,
        { error: error instanceof BrainServiceError && error.status === 401 ? 'Sign in required' : 'Request could not be completed' })
    } finally {
      req.off('aborted', abort)
      res.off('close', abort)
    }
  }))
}
