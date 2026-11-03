import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('disables every upstream global local tool plugin and all upstream presets', () => {
  const base = readFileSync(new URL('../../../bundle/base/cordis.patch.yml', import.meta.url), 'utf8')
  const profile = readFileSync(new URL('../../../../apps/cli/config/examples/brain.patch.yml', import.meta.url), 'utf8')
  const disabled = new Set([...profile.matchAll(/- id: ([^\n]+)\n  disabled: true/g)].map(match => match[1]))
  const localTools = [...base.matchAll(/    - id: ([^\n]+)\n      name: '(@deepseek-ai\/dsh-tool-[^']+)'/g)]
    .filter(match => match[2] !== '@deepseek-ai/dsh-tool-executor-native')
  expect(localTools.length).toBeGreaterThan(5)
  for (const match of localTools) expect(disabled.has(match[1])).toBe(true)
  for (const preset of ['standard', 'minimal', 'ptc', 'cordis']) expect(disabled.has(`preset-${preset}`)).toBe(true)
  expect(profile).toContain('plugins: []')
  expect(profile).toContain("name: '@deepseek-ai/dsh-llm-brain'")
  expect(disabled.has('plugin-manager')).toBe(true)
})
