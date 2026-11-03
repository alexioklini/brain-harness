import { afterEach, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { BrainCentralClient } from '@deepseek-ai/dsh-brain-central-client'
import { BrainAdapter, routerModel } from '../src/index.ts'
import { closeMockServers, mockServer } from '../../llm-pi-ai/tests/mock-server.ts'

afterEach(closeMockServers)

const model = { id: 'router-model', display_name: 'Router model', max_context: 32000,
  capabilities: ['text'], reasoning: { levels: ['low', 'high'] } }
const catalog = JSON.stringify({ data: [model] })
const policy = JSON.stringify({ policy: { execution: 'automatic' } })

async function setup(script: Parameters<typeof mockServer>[0]) {
  const server = await mockServer(script)
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const config = { baseURL: server.url, credential: 'BRAIN_TEST_KEY', timeoutMs: 5000, maxResponseBytes: 100000 }
  const credential = async () => 'fixture-key'
  return { server, adapter: new BrainAdapter(ctx, config, new BrainCentralClient({ ...config, credential }), credential) }
}

it('streams through Responses with the same central-tool and privacy identity', async () => {
  const message = { type: 'message', id: 'msg_reply', role: 'assistant',
    content: [{ type: 'output_text', text: 'Central reply', annotations: [] }] }
  const events = [
    { type: 'response.created', response: { id: 'resp_reply' } },
    { type: 'response.output_item.added', output_index: 0, item: message },
    { type: 'response.output_item.done', output_index: 0, item: message },
    { type: 'response.completed', response: { id: 'resp_reply', status: 'completed', output: [message],
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } },
  ].map(value => JSON.stringify(value))
  const { adapter, server } = await setup([{ body: policy }, { body: catalog }, { events }])
  const assembled = new BlockAssembler()
  for await (const chunk of adapter.stream({ provider: 'brain', model: model.id,
    sessionId: SessionId('brain-test-session'), messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }] })) assembled.push(chunk)
  expect(assembled.finish).toEqual({ kind: 'stop' })
  expect(server.requests[2]).toMatchObject({ model: model.id, metadata: {
    llmrouter_pii_session: 'brain-test-session', llmrouter_tools_session: 'brain-test-session',
    llmrouter_pii_source: 'brain-harness', llmrouter_context_policy: 'brain-v1',
  } })
  expect(server.requests[2]).not.toHaveProperty('metadata.llmrouter_tool_loop')
  expect(server.headers[2]?.authorization).toBe('Bearer fixture-key')
})

it('refuses a client-execution account before fetching models or making inference', async () => {
  const { adapter, server } = await setup([{ body: '{"policy":{"execution":"client"}}' }])
  await expect(adapter.prepareCall('brain', model.id)).rejects.toThrow('central automatic')
  expect(server.paths).toHaveLength(1)
})

it('refuses a revoked model before inference', async () => {
  const { adapter, server } = await setup([{ body: policy }, { body: catalog }])
  await expect(adapter.prepareCall('brain', 'revoked')).rejects.toThrow('no longer available')
  expect(server.paths).toHaveLength(2)
})

it('refuses local tool declarations before sending a model request', async () => {
  const { adapter, server } = await setup([{ body: policy }, { body: catalog }])
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'brain', model: model.id,
    sessionId: SessionId('central-only'), messages: [],
    tools: [{ name: 'local_shell', description: 'fixture', parameters: { type: 'object' } }] })) chunks.push(chunk)
  expect(server.paths).toHaveLength(2)
  expect(JSON.stringify(chunks)).toContain('central tools only')
})

it('refuses inference without a session identity', async () => {
  const { adapter, server } = await setup([{ body: policy }, { body: catalog }])
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'brain', model: model.id, messages: [] })) chunks.push(chunk)
  expect(server.paths).toHaveLength(2)
  expect(JSON.stringify(chunks)).toContain('session identity is required')
})

it('retains advertised reasoning and rejects an unsupported level instead of silently replacing it', () => {
  expect(routerModel(model)).toMatchObject({ id: model.id, reasoningEfforts: { low: 'low', high: 'high' } })
  expect(routerModel({ id: 'plain' }).reasoningEfforts).toBe(false)
  expect(() => routerModel({ id: 'future', reasoning: { levels: ['unknown-level'] } })).toThrow('not supported')
})
