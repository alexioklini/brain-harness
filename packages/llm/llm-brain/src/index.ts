/** LLMRouter adapter using the shared Responses transport and central tool loop. @module */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { BrainCentralClient, centralObject } from '@deepseek-ai/dsh-brain-central-client'
import type { CentralObject } from '@deepseek-ai/dsh-brain-central-client'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import { createGatewayAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiAdapter, PiAiModelProfile, PiAiReasoningEfforts } from '@deepseek-ai/dsh-llm-pi-ai'

/** Deployment-owned Router configuration. */
export const Config = z.object({
  baseURL: z.string().required(),
  credential: z.string().role('credential-ref').required(),
  timeoutMs: z.number().step(1).min(1).required(),
  maxResponseBytes: z.number().step(1).min(1).required(),
})
/** Deployment connection and request bounds. */
export interface Config {
  /** Router API base URL including /v1. */
  baseURL: string
  /** Host credential reference, never a literal secret. */
  credential: string
  /** Maximum request duration in milliseconds. */
  timeoutMs: number
  /** Maximum bytes in a JSON service reply. */
  maxResponseBytes: number
}

/** Convert only advertised model capabilities; no provider catalog fallback.
 * @param row - Current Router model entry.
 * @returns Shared transport model profile.
 */
export function routerModel(row: CentralObject): PiAiModelProfile {
  if (typeof row.id !== 'string' || !row.id) throw new Error('Invalid Router model identifier')
  const reasoning = row.reasoning === undefined || row.reasoning === null ? {} : centralObject(row.reasoning)
  const efforts: PiAiReasoningEfforts = {}
  if (Array.isArray(reasoning.levels)) {
    for (const value of reasoning.levels) {
      const level: unknown = value
      switch (level) {
        case 'off': case 'minimal': case 'low': case 'medium': case 'high': case 'xhigh': case 'max':
          efforts[level] = level
          break
        default: throw new Error('Router reasoning level is not supported by the transport')
      }
    }
  }
  return {
    id: row.id,
    name: typeof row.display_name === 'string' ? row.display_name : row.id,
    ...(typeof row.max_context === 'number' && row.max_context > 0 ? { contextWindow: row.max_context } : {}),
    input: Array.isArray(row.capabilities) && row.capabilities.includes('vision') ? ['text', 'image'] : ['text'],
    reasoningEfforts: Object.keys(efforts).length ? efforts : false,
  }
}

/** Resolve the live catalog for each prepared call and retain that adapter for its stream. */
export class BrainAdapter extends LlmAdapter {
  constructor(private readonly ctx: Context, private readonly config: Config,
    private readonly client: BrainCentralClient, private readonly credential: () => Promise<string>) {
    super()
  }

  override providerInfo(provider: string) { return { id: provider, name: 'Brain' } }

  private async current(signal?: AbortSignal): Promise<PiAiAdapter> {
    const policy = centralObject((await this.client.request('/tools/policy', undefined, signal)).policy)
    if (policy.execution !== 'automatic') {
      throw new LlmError('This Brain account requires central automatic tool execution', 'INVALID_CONFIG')
    }
    const models = (await this.client.models(signal))
      .filter(row => row.inference_endpoint !== '/v1/decisions').map(routerModel)
    if (!models.length) throw new LlmError('No models are available for this account', 'MODEL_NOT_FOUND')
    return createGatewayAdapter(this.ctx, { brain: { displayName: 'Brain', api: 'openai-responses',
      baseURL: this.config.baseURL, models, timeoutMs: this.config.timeoutMs } }, {
      resolveApiKey: this.credential,
      resolveAttachments: () => this.ctx.get('attachments'),
      requestMetadata: (request) => {
        if (!request.sessionId) throw new LlmError('Brain session identity is required', 'INVALID_CONFIG')
        if (request.tools?.length) throw new LlmError('Brain web sessions use central tools only', 'INVALID_CONFIG')
        return { llmrouter_pii_session: String(request.sessionId),
          llmrouter_tools_session: String(request.sessionId),
          llmrouter_pii_source: 'brain-harness', llmrouter_context_policy: 'brain-v1' }
      },
    })
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return (await this.current()).listModels(provider)
  }

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const adapter = await this.current(signal)
    if (!(await adapter.listModels(provider)).some(row => row.id === model)) {
      throw new LlmError('Selected model is no longer available', 'MODEL_NOT_FOUND')
    }
    return adapter.prepareCall(provider, model, signal)
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const prepared = await this.prepareCall(options.provider, options.model, options.signal)
    yield* prepared.stream(options)
  }
}

export const name = 'llm-brain'
export const inject = ['llm', 'credentials']

/** Register the Router route under this plugin's lifecycle. */
export function apply(ctx: Context, config: Config): void {
  const ref = credentialRef(config.credential)
  const credential = async (): Promise<string> => {
    const value = (await ctx.credentials.resolve(ref))?.value
    if (!value) throw new LlmError('Brain sign-in required', 'MISSING_CREDENTIAL')
    return value
  }
  const client = new BrainCentralClient({ baseURL: config.baseURL, timeoutMs: config.timeoutMs,
    maxResponseBytes: config.maxResponseBytes, credential })
  ctx.effect(() => ctx.llm.registerAdapter(['brain'], new BrainAdapter(ctx, config, client, credential)))
}
