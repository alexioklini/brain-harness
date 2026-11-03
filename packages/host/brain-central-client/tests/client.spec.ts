import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrainCentralClient, BrainServiceError } from '../src/index.ts'

afterEach(() => vi.unstubAllGlobals())

const session = { session: 'test-session', model: 'authorized-model', harness: 'brain-harness-test' }
function client(maxResponseBytes = 10000) {
  return new BrainCentralClient({ baseURL: 'https://router.example/v1',
    credential: async () => 'fixture-key', timeoutMs: 1000, maxResponseBytes })
}

describe('central web execution', () => {
  it('requests web selection and preserves central tool schemas verbatim', async () => {
    const catalog = { tools: [{ id: 'service-issued-id', definition: { input_schema: { type: 'object' } } }], skills: [], servers: [] }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ catalog,
      trace: { schema_version: 'router.tools.selection.v1' } })))
    vi.stubGlobal('fetch', fetcher)
    expect((await client().prepare(session, 'Find my project')).catalog).toEqual(catalog)
    const [url, options] = fetcher.mock.calls[0]!
    expect(url).toEqual(new URL('https://router.example/v1/tools/prepare'))
    expect(typeof options?.body).toBe('string')
    expect(JSON.parse(options!.body as string)).toMatchObject({ local_workspace_tools: false,
      session: 'test-session', context: { connector_harness_id: 'brain-harness-test' } })
    expect(options?.redirect).toBe('error')
  })

  it('sends tool calls only to the central execution API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"isError":false,"content":[]}'))
    vi.stubGlobal('fetch', fetcher)
    await client().call(session, 'current-catalog-id', { query: 'documents' })
    expect(typeof fetcher.mock.calls[0]![1]?.body).toBe('string')
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({ method: 'call_tool',
      arguments: { tool_id: 'current-catalog-id', arguments: { query: 'documents' } } })
  })

  it('does not reuse a model catalog after access is revoked', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{"data":[{"id":"allowed"}]}'))
      .mockResolvedValueOnce(new Response('secret upstream diagnostic', { status: 403 })))
    const api = client()
    expect(await api.models()).toEqual([{ id: 'allowed' }])
    await expect(api.models()).rejects.toEqual(new BrainServiceError(403))
  })

  it('rejects incomplete selection and oversized replies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"catalog":{"tools":[]}}'))
      .mockResolvedValueOnce(new Response('{"data":[{"id":"large"}]}')))
    await expect(client().prepare(session, 'test')).rejects.toThrow('Incomplete')
    await expect(client(8).models()).rejects.toThrow('size limit')
  })

  it('rejects endpoint escapes before resolving a credential or making a request', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    for (const path of ['//other.example', '/../admin', '/%2e%2e/admin', '/tools?key=x', '/tools\\admin']) {
      await expect(client().request(path)).rejects.toThrow('Invalid central API path')
    }
    expect(fetcher).not.toHaveBeenCalled()
    expect(() => new BrainCentralClient({ baseURL: 'http://remote.example/v1',
      credential: async () => 'fixture', timeoutMs: 1000, maxResponseBytes: 1000 })).toThrow('HTTPS')
  })
})

it('retrieves project evidence with verified account scope and rejects missing scope', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"id":"vs_fixture"}'))
    .mockResolvedValueOnce(new Response('{"data":[{"file_id":"file_fixture","filename":"test.txt","content":[{"text":"RAG marker"}]}]}'))
  vi.stubGlobal('fetch', fetcher)
  const scoped = new BrainCentralClient({ baseURL: 'https://router.example/v1', credential: async () => 'fixture',
    timeoutMs: 1000, maxResponseBytes: 10000, ragScope: { principal: 'fm-user-alice', context: { project: 'project-a', teams: [] } } })
  expect(await scoped.projectEvidence('project marker')).toMatchObject({ data: [{ filename: 'test.txt' }] })
  expect(fetcher.mock.calls[1]?.[0]).toEqual(new URL('https://router.example/v1/vector_stores/vs_fixture/search'))
  expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ 'x-rag-principal': 'fm-user-alice',
    'x-rag-context': '{"project":"project-a","teams":[]}' })
  await expect(client().projectEvidence('project marker')).rejects.toThrow('Authorized project scope required')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
