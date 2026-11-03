/** Brain controls registered through the existing conversation and sidebar slots. @module */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { Brand, Controls, SignOut } from './Controls.tsx'
import type { Actions } from './Controls.tsx'
import { centralTask, taskDefinition } from './task-data.ts'
import { brainResources } from './resource.ts'
import { en, de, zh } from './locales.ts'
import type { BrainKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { brain: BrainKey }
}

/** Shared browser services needed by the controls. */
export const inject = ['slots', 'locale', 'resources']

/** Register account-scoped controls with lifecycle-owned requests.
 * @param ctx - Browser composition services.
 */
export function apply(ctx: Context): void {
  const stopping = new AbortController()
  ctx.effect(() => () =>{  stopping.abort() })
  ctx.effect(() => ctx.locale.register('brain', { en, de, zh }))
  ctx.effect(() => ctx.resources.register(brainResources()))
  const actions: Actions = {
    async save(chat, preferences) {
      const response = await fetch('/_brain/conversations/' + encodeURIComponent(chat), { method: 'POST',
        credentials: 'same-origin', signal: stopping.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferences) })
      if (!response.ok) throw new Error('Save failed')
    },
    async saveTask(task) {
      const response = await fetch('/_brain/application/zeitplaene/tasks' + (task.id ? '/' + encodeURIComponent(task.id) : ''), {
        method: 'POST', credentials: 'same-origin', signal: stopping.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(taskDefinition(task)),
      })
      if (!response.ok) throw new Error('Save failed')
      return centralTask(await response.json())
    },
    async runTask(id) {
      const response = await fetch('/_brain/application/zeitplaene/tasks/' + encodeURIComponent(id) + '/run', {
        method: 'POST', credentials: 'same-origin', signal: stopping.signal,
        headers: { 'content-type': 'application/json' }, body: '{}',
      })
      if (!response.ok) throw new Error('Run failed')
    },
    async saveProject(id, name, instructions) {
      const response = await fetch('/_brain/application/projekte' + (id ? '/' + encodeURIComponent(id) : ''), {
        method: 'POST', credentials: 'same-origin', signal: stopping.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, anweisungen: instructions }),
      })
      if (!response.ok) throw new Error('Save failed')
      if (id) return id
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') throw new Error('Invalid project')
      return data.id
    },
    async uploadProject(id, files) {
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        const response = await fetch('/_brain/project-files/' + encodeURIComponent(id), {
          method: 'POST', credentials: 'same-origin', signal: stopping.signal,
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, base64: btoa(binary) }),
        })
        if (!response.ok) throw new Error('Upload failed')
      }
    },
    async signOut() {
      const response = await fetch('/_brain/logout', { method: 'POST', credentials: 'same-origin', signal: stopping.signal })
      if (!response.ok) throw new Error('Sign out failed')
      window.location.replace('/')
    },
  }
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'brain.controls', locale: 'brain', inject: () => actions,
  }, Controls))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', locale: 'brain' }, Brand))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'brain.sign-out', locale: 'brain', inject: () => actions,
  }, SignOut))
}
