/** Deployment settings and user-owned web worker handles. @module */
import type { BrainAccountSession } from '@deepseek-ai/dsh-brain-central-client'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'

/** Explicit deployment limits and paths. */
export interface GatewayConfig {
  /** Public HTTPS origin, or HTTP 127.0.0.1 for local preview, used for browser origin checks. */
  publicURL: string
  /** Existing Brain account API origin. */
  brainURL: string
  /** LLMRouter origin, without an API path. */
  routerURL: string
  /** Parent-only shared Router credential reference. */
  routerCredential: string
  /** Physical directory containing separate account homes. */
  storageRoot: string
  /** Built supported dsh CLI entrypoint. */
  cliBin: string
  /** Reviewed central-only worker profile patch. */
  workerPatch: string
  /** Node executable used for worker processes. */
  nodeBin: string
  /** Initial authorized Router model identifier. */
  defaultModel: string
  /** Maximum concurrently retained user runtimes. */
  maxUsers: number
  /** Maximum retained browser and automation logins. */
  maxLogins: number
  /** Browser login lifetime in milliseconds. */
  sessionMs: number
  /** Maximum worker startup duration in milliseconds. */
  startupTimeoutMs: number
  /** Request deadline including streamed responses. */
  requestTimeoutMs: number
  /** Maximum accepted upload and JSON response bytes. */
  maxBodyBytes: number
  /** Grace period before forced process termination. */
  shutdownGraceMs: number
  /** Built login HTML entrypoint. */
  loginIndex: string
  /** Physical artifact and system directories readable by workers; may not overlap user storage. */
  workerReadableRoots: string[]
}

/** A running process and the private authority used only by its gateway. */
export interface UserWorker {
  home: string
  token: string
  origin: string
  cookie: string
  process: SubprocessHandle
  account: BrainAccountSession
}
