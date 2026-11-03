/** Built Brain profile must not expose upstream local execution surfaces. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FiberState } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { withDefaultWeb } from './default-web-process.ts'

it('boots Brain with its central adapter and without local tools, MCP or terminal services', async (test) => {
  const profile = fileURLToPath(new URL('../../../../config/examples/brain.patch.yml', import.meta.url))
  const patches = [profile]
  await withDefaultWeb(test, async ({ request }) => {
    const roster = await request('roster')
    const active = roster.entries.filter(entry => entry.state === FiberState.ACTIVE)
    expect(active).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '@deepseek-ai/dsh-llm-brain' }),
      expect.objectContaining({ name: '@deepseek-ai/dsh-host-webserver' }),
    ]))
    expect(active.filter(entry => entry.name.startsWith('@deepseek-ai/dsh-tool-')
      && entry.name !== '@deepseek-ai/dsh-tool-executor-native')).toEqual([])
    for (const name of ['mcp-manager', 'mcp-resources', 'api-terminal-controller', 'schedule', 'plugin-manager']) {
      expect(active.some(entry => entry.name === `@deepseek-ai/dsh-${name}`)).toBe(false)
    }
  }, { patches, prepare: async (root) => {
    const fixture = join(root, 'brain-fixture.patch.yml')
    await writeFile(fixture, JSON.stringify([
      { id: 'agent-default-model', config: { provider: 'brain', model: 'fixture-model' } },
      { id: 'llm-brain', config: { baseURL: 'http://127.0.0.1:1/v1', credential: 'BRAIN_FIXTURE',
        timeoutMs: 100, maxResponseBytes: 4096 } },
    ]))
    patches.push(fixture)
  } })
})
