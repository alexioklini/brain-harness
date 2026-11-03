/** Central service JSON values and sanitized errors. @module */
/** JSON object received from a central service. */
export type CentralObject = Record<string, unknown>

/** Parse an external object without accepting null or arrays.
   * @param value - Untrusted decoded JSON.
   * @returns Validated object.
   */
export function centralObject(value: unknown): CentralObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid central service response')
  }
  return value as CentralObject
}

/** HTTP failure with a safe message; service bodies and credentials are excluded. */
export class BrainServiceError extends Error {
  constructor(readonly status: number) {
    super(`Central service request failed (${status})`)
    this.name = 'BrainServiceError'
  }
}
