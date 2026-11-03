/** One managed Harness process and storage root per authenticated Brain account. @module */
import { mkdir, writeFile, lstat, realpath } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { BrainAccountSession } from '@deepseek-ai/dsh-brain-central-client'
import type { GatewayConfig, UserWorker } from './types.ts'

/** Own user workers through startup, concurrent login and shutdown. */
export class UserWorkers {
  private readonly workers = new Map<string, Promise<UserWorker>>()
  private readonly stopping = new AbortController()
  constructor(private readonly ctx: Context, private readonly config: GatewayConfig,
    private readonly gatewayOrigin: () => string) {}

  /** Reuse only the authenticated account's worker.
   * @param account - Capability returned by successful Brain login.
   * @returns Its running, privately authenticated worker.
   */
  async acquire(account: BrainAccountSession): Promise<UserWorker> {
    await account.authorize('web-login')
    this.stopping.signal.throwIfAborted()
    const key = account.storageKey
    let worker = this.workers.get(key)
    if (!worker) {
      if (this.workers.size >= this.config.maxUsers) throw new Error('Server capacity reached')
      worker = this.start(account)
      this.workers.set(key, worker)
      void worker.catch(() => { if (this.workers.get(key) === worker) this.workers.delete(key) })
    }
    const ready = await worker
    ready.account = account
    return ready
  }

  /** Find a worker by its private token, never by a browser-supplied account id.
   * @param token - Server-only bearer token assigned at worker startup.
   * @returns Matching active worker, or undefined.
   */
  async byToken(token: string): Promise<UserWorker | undefined> {
    if (!/^[a-f0-9]{64}$/.test(token)) return undefined
    for (const promise of this.workers.values()) {
      const worker = await promise.catch(() => undefined)
      if (worker?.token === token) return worker
    }
    return undefined
  }

  /** Stop all children and await their managed process ranges. */
  async close(): Promise<void> {
    this.stopping.abort()
    await Promise.all([...this.workers.values()].map(async (pending) => {
      const worker = await pending.catch(() => undefined)
      if (!worker) return
      worker.process.terminate()
      await worker.process.waitForExit()
    }))
    this.workers.clear()
  }

  private async start(account: BrainAccountSession): Promise<UserWorker> {
    const root = resolve(this.config.storageRoot)
    await mkdir(root, { recursive: true, mode: 0o700 })
    if (await realpath(root) !== root) throw new Error('User storage root must not contain symlinks')
    const home = join(root, account.storageKey)
    await mkdir(home, { recursive: true, mode: 0o700 })
    if ((await lstat(home)).isSymbolicLink() || await realpath(home) !== home) throw new Error('Invalid user storage directory')
    for (const readable of this.config.workerReadableRoots) {
      const physical = await realpath(readable)
      const inside = relative(physical, root)
      const descendant = relative(root, physical)
      if (inside === '' || inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside)
        || descendant !== '..' && !descendant.startsWith('..' + sep) && !isAbsolute(descendant)) {
        throw new Error('Worker read grants must not include the users directory')
      }
    }
    const temp = join(home, 'tmp')
    await mkdir(temp, { recursive: true, mode: 0o700 })
    const token = randomBytes(32).toString('hex')
    const patch = join(home, 'gateway.patch.yml')
    // This credential reaches only the local gateway; it is not the shared Router key.
    await writeFile(patch, JSON.stringify([
      { id: 'llm-brain', config: { baseURL: this.gatewayOrigin() + '/_brain/router/v1', credential: 'BRAIN_ROUTER_KEY',
        timeoutMs: this.config.requestTimeoutMs, maxResponseBytes: this.config.maxBodyBytes } },
      { id: 'agent-default-model', config: { provider: 'brain', model: this.config.defaultModel } },
    ]), { mode: 0o600 })
    const confined = await this.ctx.sandbox.confine([this.config.nodeBin, this.config.cliBin, 'web', '--patch', this.config.workerPatch,
      '--patch', patch, '--host', '127.0.0.1', '--port', '0', '--no-open'],
    { mode: 'workspace-write', workspaceRoot: home, readableRoots: [...this.config.workerReadableRoots, home] },
    this.stopping.signal)
    if (confined.enforcement !== 'full') throw new Error('User storage isolation is unavailable')
    const process = this.ctx.subprocess.spawn({
      argv: confined.argv,
      cwd: home, graceMs: this.config.shutdownGraceMs, signal: this.stopping.signal,
      env: { HOME: home, TMPDIR: temp, DSH_HOME: home, DSH_AGENTS_HOME: join(home, '.agents'), DSH_TELEMETRY_DISABLED: '1',
        BRAIN_ROUTER_KEY: token, FM_ROUTER_KEY: undefined, FM_JEV_ROUTER_KEY: undefined,
        FM_PII_TOKEN: undefined, FM_SEARCH_TOKEN: undefined, NODE_OPTIONS: undefined, NODE_PATH: undefined, TSX_TSCONFIG_PATH: undefined },
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 8192 } },
    })
    const timeout = AbortSignal.timeout(this.config.startupTimeoutMs)
    const signal = AbortSignal.any([this.stopping.signal, timeout])
    try {
      const url = await new Promise<URL>((ready, fail) => {
        let text = ''
        const abort = (): void => { cleanup(); fail(new Error('User runtime startup cancelled')) }
        const data = (chunk: Buffer): void => {
          text = (text + chunk.toString()).slice(-16384)
          const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/[^\s]*)/.exec(text)
          if (!match?.[1]) return
          cleanup()
          ready(new URL(match[1]))
        }
        const cleanup = (): void => { signal.removeEventListener('abort', abort); process.stdout?.off('data', data) }
        signal.addEventListener('abort', abort, { once: true })
        process.stdout?.on('data', data)
        void process.done.then((outcome) => {
          cleanup()
          const diagnostic = process.collected.stderr?.readFrom(0).text.replaceAll(token, '[worker credential]')
          fail(new Error('User runtime exited before startup', { cause: { outcome, diagnostic } }))
        }, () => {
          cleanup(); fail(new Error('User runtime startup failed'))
        })
        if (signal.aborted) abort()
      })
      const response = await fetch(url, { redirect: 'manual', signal })
      await response.body?.cancel()
      const cookies = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).filter(Boolean)
      if (!cookies.length) throw new Error('User runtime authentication failed')
      // Drain private stdout; launch URLs must never reach service logs or the browser.
      process.stdout?.resume()
      const result = { home, token, origin: url.origin, cookie: cookies.join('; '), process, account }
      void process.done.finally(() => { this.workers.delete(account.storageKey) }).catch((_error: unknown) => {
        // Process exit is owned by the managed subprocess.
      })
      return result
    } catch (error) {
      process.terminate()
      await process.waitForExit()
      throw error
    }
  }
}
