/** Central scheduler values validated before editing and rendering. @module */
/** A calendar-based central task; extra service fields survive updates. */
export interface CentralTask extends Record<string, unknown> {
  id?: string
  name: string
  prompt: string
  model: string
  project?: string
  enabled: boolean
  archived?: boolean
  attachments: unknown[]
  schedule: { frequency: string; interval: number; anchor: string; timezone: string } | null
}

/** Validate central scheduler records, retaining service-owned configuration.
 * @param input - Untrusted service JSON.
 * @returns Editable calendar task.
 */
export function centralTask(input: unknown): CentralTask {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid task')
  const row = input as Record<string, unknown>
  if (row.id !== undefined && (typeof row.id !== 'string' || !/^sched_[a-f0-9]{32}$/.test(row.id))
    || typeof row.name !== 'string' || typeof row.prompt !== 'string' || typeof row.model !== 'string'
    || typeof row.enabled !== 'boolean' || !Array.isArray(row.attachments)
    || row.project !== undefined && typeof row.project !== 'string') throw new Error('Invalid task')
  if (row.schedule !== null) {
    if (!row.schedule || typeof row.schedule !== 'object' || Array.isArray(row.schedule)) throw new Error('Invalid schedule')
    const rule = row.schedule as Record<string, unknown>
    if (typeof rule.frequency !== 'string' || typeof rule.interval !== 'number' || !Number.isSafeInteger(rule.interval) || rule.interval < 1
      || typeof rule.anchor !== 'string' || typeof rule.timezone !== 'string') throw new Error('Invalid schedule')
  }
  return row as CentralTask
}

/** Strip scheduler result fields when saving a definition.
 * @param task - Validated edited task.
 * @returns Request fields accepted by Brain's scheduler API.
 */
export function taskDefinition(task: CentralTask): Record<string, unknown> {
  const { id: _id, next_run_at: _next, archived: _archived, connector_notification_config: _notification, ...definition } = task
  return definition
}
