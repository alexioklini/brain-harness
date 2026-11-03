/** Conversation controls using the shared menu, button and modal primitives. @module */
import { Choice } from './Choice.tsx'
import { Tasks } from './Tasks.tsx'
import type { CentralTask } from './task-data.ts'
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type { Preferences } from './resource.ts'
import css from './Controls.module.css'

/** Gateway mutations injected by the plugin, with no context in the view. */
export interface Actions {
  save: (chat: string, preferences: Preferences) => Promise<void>
  signOut: () => Promise<void>
  saveTask: (task: CentralTask) => Promise<CentralTask>
  runTask: (id: string) => Promise<void>
}
type ControlsProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'brain'> & InjectFace<Actions>

/** Bind mode and project selection to the currently displayed conversation.
 * @param props - Framework session identity, resource reader and narrow mutations.
 * @returns Shared controls with actionable save/read failures.
 */
export function Controls({ sessionId, useResource, save, t }: ControlsProps) {
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tools, setTools] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const path = encodeURIComponent(sessionId)
  const preferences = useResource<'brain'>(`dsh-resource://brain/preferences/${path}?revision=${revision}`)
  const projects = useResource<'brain'>(`dsh-resource://brain/projects?revision=${revision}`)
  const current = preferences.value?.kind === 'preferences' ? preferences.value.value : undefined
  const choices = projects.value?.kind === 'projects' ? projects.value.value : []
  const update = async (value: Preferences): Promise<void> => {
    setBusy(true); setFailed(false)
    try { await save(sessionId, value); setRevision(value => value + 1) }
    catch (_error: unknown) { setFailed(true) }
    finally { setBusy(false) }
  }
  return <div className={css.controls}>
    <Choice label={t('mode')} value={current?.mode ?? ''} disabled={busy || !current}
      items={[{ id: 'chat', label: t('chat') }, { id: 'moa', label: t('moa') }, { id: 'research', label: t('research') }]}
      onChange={(mode) => { if (current && (mode === 'chat' || mode === 'moa' || mode === 'research')) void update({ ...current, mode }) }} />
    <Choice label={t('project')} value={current?.project ?? ''} disabled={busy || !current || projects.status !== 'live'}
      items={[{ id: '', label: t('noProject') }, ...choices.map(project => ({ id: project.id, label: project.name }))]}
      onChange={(project) => { if (current) void update({ ...current, project: project || null }) }} />
    <Button size="sm" onClick={() =>{  setTools(true) }}>{t('tools')}</Button>
    <Button size="sm" onClick={() =>{  setPrivacy(true) }}>{t('privacy')}</Button>
    {(failed || preferences.status === 'failed' || projects.status === 'failed') && <span role="alert">
      {t(failed ? 'saveFailed' : 'failed')}
      <Button size="sm" onClick={() =>{  setRevision(value => value + 1) }}>{t('refresh')}</Button>
    </span>}
    {tools && <Tools sessionId={sessionId} useResource={useResource} t={t} onClose={() =>{  setTools(false) }} />}
    {privacy && <Privacy sessionId={sessionId} useResource={useResource} t={t} onClose={() =>{  setPrivacy(false) }} />}
  </div>
}

function Privacy({ sessionId, useResource, t, onClose }: Pick<ControlsProps, 'sessionId' | 'useResource' | 't'> & { onClose: () => void }) {
  const [revision, setRevision] = useState(0)
  const resource = useResource<'brain'>(`dsh-resource://brain/privacy/${encodeURIComponent(sessionId)}?revision=${revision}`)
  const value = resource.value?.kind === 'privacy' ? resource.value.value : undefined
  return <Modal open title={t('privacy')} closeLabel={t('close')} onClose={onClose}>
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p>
      : value === undefined ? <p role="status">{t('loading')}</p>
        : value === null ? <p role="status">{t('noPrivacy')}</p>
          : <dl className={css.facts}>
            {(['funde', 'identitaeten', 'ersetzungen'] as const).map(key => value[key] === 0 ? null : <div key={key}>
              <dt>{t(({ funde: 'findings', identitaeten: 'identities', ersetzungen: 'replacements' } as const)[key])}</dt>
              <dd>{value[key] ?? t('unknown')}</dd>
            </div>)}
          </dl>}
    <Button onClick={() =>{  setRevision(value => value + 1) }}>{t('refresh')}</Button>
  </Modal>
}

/** End the gateway login and return to its sign-in page.
 * @param props - Injected account mutation and localized labels.
 * @returns The shared sign-out control and its failure state.
 */
export function SignOut({ signOut, saveTask, runTask, useResource, t }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'brain'> & InjectFace<Actions>) {
  const [failed, setFailed] = useState(false)
  const [tasks, setTasks] = useState(false)
  return <div><Button onClick={() =>{  setTasks(true) }}>{t('tasks')}</Button><Button onClick={() => { void signOut().catch(() =>{  setFailed(true) }) }}>{t('signOut')}</Button>
    {failed && <span role="alert">{t('failed')}</span>}
    {tasks && <Tasks useResource={useResource} saveTask={saveTask} runTask={runTask} t={t} onClose={() =>{  setTasks(false) }} />}
  </div>
}

/** Product name in the shared sidebar brand slot.
 * @param props - Localized product label.
 * @returns Concise brand text without build diagnostics.
 */
export function Brand({ t }: PropsRuntime<'sidebar.brand.name'> & PropsLocale<'brain'>) {
  return <span>{t('brand')}</span>
}

function Tools({ sessionId, useResource, t, onClose }: Pick<ControlsProps, 'sessionId' | 'useResource' | 't'> & { onClose: () => void }) {
  const [revision, setRevision] = useState(0)
  const resource = useResource<'brain'>(`dsh-resource://brain/tools/${encodeURIComponent(sessionId)}?revision=${revision}`)
  const value = resource.value?.kind === 'tools' ? resource.value.value : undefined
  return <Modal open title={t('tools')} closeLabel={t('close')} onClose={onClose}>
    {resource.status === 'failed' || value?.status === 'failed' ? <p role="alert">{t('failed')}</p>
      : value === undefined ? <p role="status">{t('loading')}</p>
        : value.status === 'running' ? <p role="status">{t('running')}</p>
          : value.calls.length === 0 ? <p>{t('noTools')}</p> : value.calls.map(call => <details key={call.id}>
            <summary>{call.name} · {t(call.status)}</summary>
            <pre>{call.arguments}</pre><pre>{call.output}</pre>
          </details>)}
    <Button onClick={() =>{  setRevision(value => value + 1) }}>{t('refresh')}</Button>
  </Modal>
}
