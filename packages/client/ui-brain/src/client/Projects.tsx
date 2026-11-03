/** Account-owned project editing and document upload through Brain. @module */
import { useRef, useState } from 'react'
import { Button, Input, InlineEditor, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Actions } from './Controls.tsx'
import type { BrainResource } from './resource.ts'
import { Choice } from './Choice.tsx'
import css from './Controls.module.css'

type Props = Pick<PropsRuntime<'sidebar.footer.action'>, 'useResource'> & PropsLocale<'brain'>
  & Pick<Actions, 'saveProject' | 'uploadProject'> & { onClose: () => void }
type Project = Extract<BrainResource, { kind: 'project' }>['value']
type EditorProps = Pick<Props, 'saveProject' | 'uploadProject' | 't' | 'onClose'>
  & { project?: Project; onSaved: (id: string) => void }

/** List and edit only projects returned by the signed-in account.
 * @param props - Account resources and project mutations.
 * @returns Shared project selection and document editor modal.
 */
export function Projects({ useResource, saveProject, uploadProject, t, onClose }: Props) {
  const [selected, setSelected] = useState('')
  const [revision, setRevision] = useState(0)
  const resource = useResource<'brain'>(`dsh-resource://brain/projects?revision=${revision}`)
  const projects = resource.value?.kind === 'projects' ? resource.value.value : []
  const onSaved = (id: string): void => { setSelected(id); setRevision(value => value + 1) }
  return <Modal open title={t('projects')} closeLabel={t('close')} onClose={onClose}>
    <div className={css.taskForm}>
      <Choice label={t('projects')} value={selected} disabled={resource.status !== 'live'}
        items={[{ id: '', label: t('newProject') }, ...projects.map(project => ({ id: project.id, label: project.name }))]}
        onChange={setSelected} />
      {resource.status === 'failed' && <p role="alert">{t('failed')}</p>}
      {selected ? <SelectedProject key={selected + ':' + String(revision)} id={selected} revision={revision} useResource={useResource}
        saveProject={saveProject} uploadProject={uploadProject} t={t} onClose={onClose} onSaved={onSaved} />
        : <ProjectEditor saveProject={saveProject} uploadProject={uploadProject} t={t} onClose={onClose} onSaved={onSaved} />}
      <Button onClick={() => { setRevision(value => value + 1) }}>{t('refresh')}</Button>
    </div>
  </Modal>
}

function SelectedProject({ id, revision, useResource, ...props }: EditorProps & Pick<Props, 'useResource'> & { id: string; revision: number }) {
  const resource = useResource<'brain'>(`dsh-resource://brain/project/${encodeURIComponent(id)}?revision=${revision}`)
  if (resource.status === 'failed') return <p role="alert">{props.t('failed')}</p>
  if (resource.value?.kind !== 'project') return <p role="status">{props.t('loading')}</p>
  return <ProjectEditor {...props} project={resource.value.value} />
}

function ProjectEditor({ project, saveProject, uploadProject, onSaved, t, onClose }: EditorProps) {
  const [name, setName] = useState(project?.name ?? '')
  const [instructions, setInstructions] = useState(project?.instructions ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'saveFailed' | 'uploadFailed' | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const writable = project?.writable ?? true
  const save = async (): Promise<void> => {
    if (busy || !writable || !name.trim()) return
    setBusy(true); setError(null)
    try { onSaved(await saveProject(project?.id, name, instructions)) }
    catch (_error: unknown) { setError('saveFailed') }
    finally { setBusy(false) }
  }
  const upload = async (files: FileList): Promise<void> => {
    if (!project || busy || !writable) return
    setBusy(true); setError(null)
    try { await uploadProject(project.id, files); onSaved(project.id) }
    catch (_error: unknown) { setError('uploadFailed') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return <div className={css.taskForm}>
    <label>{t('name')}<Input disabled={busy || !writable} value={name} onChange={(event) => { setName(event.target.value) }} /></label>
    {writable ? <label>{t('instructions')}<InlineEditor label={t('instructions')} value={instructions}
      onChange={setInstructions} onSave={() => { void save() }} onCancel={onClose} /></label>
      : <pre className={css.output}>{instructions}</pre>}
    {writable && <div className={css.controls}>
      <Button disabled={busy || !name.trim()} onClick={() => { void save() }}>{t('save')}</Button>
      {project && <Button disabled={busy} onClick={() => { input.current?.click() }}>{t('upload')}</Button>}
      <input ref={input} type="file" multiple hidden onChange={(event) => { if (event.target.files) void upload(event.target.files) }} />
    </div>}
    {project?.files.map(file => <div key={file.name}>{file.name} · {file.status === 'unknown' ? t('unknown') : file.status}</div>)}
    {error && <p role="alert">{t(error)}</p>}
  </div>
}
