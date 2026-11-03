import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { BrainCentralClient } from '@deepseek-ai/dsh-brain-central-client'
import { SessionId } from '@deepseek-ai/dsh-session'
import { renderContextSnapshot } from '@deepseek-ai/dsh-system-prompt'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '../../../test-support/agent-loop-testkit/src/index.ts'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import * as Brain from '../src/index.ts'

it('retains project evidence with optional runtime context disabled and clears it after deselection', async () => {
  const ctx = new Context()
  const request = vi.spyOn(BrainCentralClient.prototype, 'request')
    .mockResolvedValueOnce({ instructions: '', evidence: 'Source: project.txt; marker COPPER' })
    .mockResolvedValueOnce({ instructions: '', evidence: '' })
  try {
    await mountAgentLoopTestDependencies(ctx, { systemPrompt: { includeRuntimeContext: false } })
    await ctx.plugin(MemoryCredentials, { BRAIN_TEST_KEY: 'fixture' })
    await ctx.plugin(Brain, { baseURL: 'https://example.invalid/v1', credential: 'BRAIN_TEST_KEY',
      timeoutMs: 5000, maxResponseBytes: 100000, gatewayContext: true })
    const harness = await mountAgentLoopTestHarness(ctx)
    const agent = await harness.create(SessionId('project-context'))
    const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent })
    expect(renderContextSnapshot(assembly)).toContain('Source: project.txt; marker COPPER')
    expect(renderContextSnapshot(await ctx.systemPrompt.assemble({ agent, scope: agent }))).not.toContain('COPPER')
    expect(renderContextSnapshot(await ctx.systemPrompt.assemble())).toBe('')
  } finally {
    request.mockRestore()
    await ctx.fiber.dispose()
  }
})
