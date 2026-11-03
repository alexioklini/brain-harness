/** Basic credentials for controller-owned HTTPS API clients. @module */
import { BrainServiceError } from '@deepseek-ai/dsh-brain-central-client'

/** Decode one bounded Basic header; never log or persist the returned password.
 * @param header - Authorization supplied by the API client.
 * @returns Existing Brain account credentials, or undefined for other schemes.
 */
export function basicCredentials(header: string | undefined): { username: string; password: string } | undefined {
  if (!header || !/^Basic\s/i.test(header)) return undefined
  const encoded = header.slice(6)
  if (header[5] !== ' ' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || header.length > 8192) throw new BrainServiceError(401)
  let decoded: string
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(encoded, 'base64')) }
  catch { throw new BrainServiceError(401) }
  const delimiter = decoded.indexOf(':')
  if (delimiter <= 0 || delimiter === decoded.length - 1 || /[\r\n\0]/.test(decoded)) throw new BrainServiceError(401)
  return { username: decoded.slice(0, delimiter), password: decoded.slice(delimiter + 1) }
}
