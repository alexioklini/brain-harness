/** Account-scoped central calendar task editor. @module */
import { useState } from 'react'
import { Button, Checkbox, Input, InlineEditor, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Actions } from './Controls.tsx'
import type { CentralTask } from './task-data.ts'
import { Choice } from './Choice.tsx'
import css from './Controls.module.css'

type Props = Pick<PropsRuntime<'sidebar.footer.action'>, 'useResource'> & PropsLocale<'brain'>
  & Pick<Actions, 'saveTask' | 'runTask'> & { onClose: () => void }

function freshTask(): CentralTask {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  return { name: '', prompt: '', model: '', enabled: false, attachments: [], chat_mode: 'new',
    schedule: { frequency: 'daily', interval: 1, anchor: day + 'T09:00', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }
}

/** Edit central tasks without replacing service-owned fields.
 * @param props - Account resources, task mutations, and localized labels.
 * @returns Shared modal with task selection and calendar fields.
 */
export function Tasks({ useResource, saveTask, runTask, t, onClose }: Props) {
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState<CentralTask>(freshTask)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'saved' | 'queued' | 'saveFailed' | null>(null)
  const tasks = useResource<'brain'>(`dsh-resource://brain/tasks?revision=${revision}`)
  const runs = useResource<'brain'>(`dsh-resource://brain/runs?revision=${revision}`)
  const models = useResource<'brain'>('dsh-resource://brain/models')
  const projects = useResource<'brain'>('dsh-resource://brain/projects')
  const rows = tasks.value?.kind === 'tasks' ? tasks.value.value : []
  const modelRows = models.value?.kind === 'models' ? models.value.value : []
  const projectRows = projects.value?.kind === 'projects' ? projects.value.value : []
  const runRows = runs.value?.kind === 'runs' ? runs.value.value.filter(run => run.task === draft.id) : []
  const disabled = busy || draft.archived === true
  const update = (value: Partial<CentralTask>): void => { setDraft({ ...draft, ...value }); setStatus(null) }
  const submit = async (run: boolean): Promise<void> => {
    setBusy(true); setStatus(null)
    try {
      if (run && draft.id) { await runTask(draft.id); setStatus('queued'); setRevision(value => value + 1) }
      else { setDraft(await saveTask(draft)); setStatus('saved'); setRevision(value => value + 1) }
    } catch (_error: unknown) { setStatus('saveFailed') }
    finally { setBusy(false) }
  }
  return <Modal open title={t('tasks')} closeLabel={t('close')} onClose={onClose}>
    <div className={css.taskForm}>
      <Choice label={t('tasks')} value={draft.id ?? ''} disabled={busy || tasks.status !== 'live'}
        items={[{ id: '', label: t('newTask') }, ...rows.flatMap(row => row.id ? [{ id: row.id, label: row.name }] : [])]}
        onChange={(id) => { setDraft(rows.find(row => row.id === id) ?? freshTask()); setStatus(null) }} />
      {[tasks, models, projects].some(resource => resource.status === 'failed') && <p role="alert">{t('failed')}</p>}
      <label>{t('name')}<Input value={draft.name} disabled={disabled} onChange={(event) =>{  update({ name: event.target.value }) }} /></label>
      <label>{t('prompt')}<InlineEditor label={t('prompt')} value={draft.prompt}
        onChange={(prompt) => { if (!disabled) update({ prompt }) }} onSave={() => {}} onCancel={onClose} /></label>
      <Choice label={t('model')} value={draft.model} disabled={disabled || models.status !== 'live'}
        items={modelRows.map(row => ({ id: row.id, label: row.name }))} onChange={(model) =>{  update({ model }) }} />
      <Choice label={t('project')} value={draft.project ?? ''} disabled={disabled || projects.status !== 'live'}
        items={[{ id: '', label: t('noProject') }, ...projectRows.map(row => ({ id: row.id, label: row.name }))]}
        onChange={(project) => { const next = { ...draft }; if (project) next.project = project; else delete next.project
          setDraft(next) }} />
      {draft.schedule && <>
        <Choice label={t('frequency')} value={draft.schedule.frequency} disabled={disabled}
          items={(['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const).map(id => ({ id, label: t(id) }))}
          onChange={(frequency) => { if (draft.schedule) update({ schedule: { ...draft.schedule, frequency } }) }} />
        <label>{t('interval')}<Input type="number" min={1} step={1} disabled={disabled} value={draft.schedule.interval}
          onChange={(event) => {
            if (draft.schedule) update({ schedule: { ...draft.schedule, interval: event.target.valueAsNumber } })
          }} /></label>
        <label>{t('anchor')}<Input type="datetime-local" disabled={disabled} value={draft.schedule.anchor}
          onChange={(event) => { if (draft.schedule) update({ schedule: { ...draft.schedule, anchor: event.target.value } }) }} /></label>
        <label>{t('timezone')}<Input disabled={disabled} value={draft.schedule.timezone}
          onChange={(event) => { if (draft.schedule) update({ schedule: { ...draft.schedule, timezone: event.target.value } }) }} /></label>
      </>}
      <Checkbox disabled={disabled} checked={draft.enabled} label={t('enabled')} onChange={(enabled) => { update({ enabled }) }} />
      <div className={css.controls}>
        <Button disabled={disabled || !draft.name.trim() || !draft.prompt.trim() || !draft.model || !!draft.schedule && (!Number.isSafeInteger(draft.schedule.interval) || draft.schedule.interval < 1 || !draft.schedule.anchor || !draft.schedule.timezone)} onClick={() => { void submit(false) }}>{t('save')}</Button>
        {draft.id && <Button disabled={disabled} onClick={() => { void submit(true) }}>{t('runNow')}</Button>}
        <Button disabled={busy} onClick={() =>{  setRevision(value => value + 1) }}>{t('refresh')}</Button>
      </div>
      {draft.id && runs.status === 'failed' && <p role="alert">{t('failed')}</p>}
      {runRows.map(run => <details key={run.id}>
        <summary>{t(run.status === 'failed' ? 'executionFailed' : run.status)}</summary>
        {run.output && <pre className={css.output}>{run.output}</pre>}
        {run.error && <p role="alert">{run.error}</p>}
      </details>)}
      {status && <p role={status === 'saveFailed' ? 'alert' : 'status'}>{t(status)}</p>}
    </div>
  </Modal>
}
