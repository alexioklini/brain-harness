/** Built worker startup uses the supported CLI and actual macOS read confinement. */
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Subprocess from '@deepseek-ai/dsh-subprocess-local'
import Sandbox from '@deepseek-ai/dsh-sandbox-local'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { BrainAccount, BrainAccountSession } from '@deepseek-ai/dsh-brain-central-client'
import { expect, it } from 'vitest'
import { UserWorkers } from '@deepseek-ai/dsh-brain-web/src/workers.ts'

const repo = fileURLToPath(new URL('../../../../../../', import.meta.url))
const runtime = process.env.DSH_BRAIN_TEST_RUNTIME
const cli = runtime ? join(runtime, 'node_modules/@deepseek-ai/dsh') : join(repo, 'apps/cli')
it.runIf(process.platform === 'darwin')('starts the confined web worker and reuses it only for the same account', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'brain-worker-built-')))
  const ctx = new Context()
  let workers: UserWorkers | undefined
  try {
    await ctx.plugin(Subprocess)
    await ctx.plugin(Sandbox)
    workers = new UserWorkers(ctx, {
      publicURL: 'https://brain-harness.example', brainURL: 'http://127.0.0.1:1', routerURL: 'http://127.0.0.1:1',
      routerCredential: 'FIXTURE', storageRoot: join(root, 'users'),
      cliBin: join(cli, 'lib/bin.js'), workerPatch: join(cli, 'config/examples/brain.patch.yml'),
      nodeBin: process.execPath, defaultModel: 'fixture', maxUsers: 2, maxLogins: 8, sessionMs: 60000,
      startupTimeoutMs: 30000, requestTimeoutMs: 5000, maxBodyBytes: 1048576, shutdownGraceMs: 1000,
      loginIndex: join(repo, 'apps/web/dist/brain-login.html'),
      workerReadableRoots: [repo.slice(0, -1), ...(existsSync(join(homedir(), 'node_modules')) ? [await realpath(join(homedir(), 'node_modules'))] : []), '/opt/homebrew', '/usr', '/bin', '/System', '/dev', '/Library', '/private/etc', '/private/var/db'],
    }, () => 'http://127.0.0.1:1')
    const account: BrainAccountSession = {
      storageKey: 'user-' + 'a'.repeat(64), close() {},
      async uploadProjectFile() { throw new Error('unused fixture upload') },
      async request() { throw new Error('No application requests expected') },
      async authorize() { return { account: { id: brandString<BrainAccount['id']>('fixture'), name: 'Fixture', teams: [] },
        principal: 'fm-user-fixture', session: 'fixture', context: { teams: [] } } },
    }
    const first = await workers.acquire(account).catch((error: unknown) => {
      if (error instanceof Error) throw new Error(JSON.stringify(error.cause), { cause: error })
      throw error
    })
    expect((await workers.acquire(account)).origin).toBe(first.origin)
    expect(first.home).toBe(join(root, 'users', account.storageKey))
    expect(await workers.byToken('b'.repeat(64))).toBeUndefined()
    const response = await fetch(first.origin, { headers: { cookie: first.cookie } })
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<html')
    expect(html).toContain('"id":"@deepseek-ai/dsh-api-workspace-controller"')
    const workspace = await fetch(new URL('/api/workspace/initializeDefault', first.origin), {
      method: 'POST', headers: { cookie: first.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'workspace-boot', method: 'workspace/initializeDefault',
        payload: { args: {} } }),
    })
    expect(workspace.status).toBe(200)
    expect(await workspace.json()).toMatchObject({ result: { ok: true } })
  } finally {
    await workers?.close()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
