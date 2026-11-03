import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { seatbeltProfileArgs } from '../src/profiles.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'brain-read-isolation-')))
  roots.push(root)
  const alice = join(root, 'alice')
  const bob = join(root, 'bob')
  mkdirSync(alice); mkdirSync(bob)
  writeFileSync(join(alice, 'chat.txt'), 'alice conversation')
  writeFileSync(join(bob, 'chat.txt'), 'bob conversation')
  return { root, alice, bob }
}

it('keeps existing read policy unchanged unless exclusive grants are requested', () => {
  expect(seatbeltProfileArgs({ mode: 'read-only', workspaceRoot: '/' })[1]).not.toContain('deny file-read-data')
  expect(seatbeltProfileArgs({ mode: 'read-only', workspaceRoot: '/', readableRoots: [] })[1]).toContain('deny file-read-data')
})

it.runIf(process.platform === 'darwin')('allows the owner file and denies a sibling account through the real OS sandbox', () => {
  const baseline = spawnSync('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)', '--', '/bin/echo', 'ready'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
  expect(baseline.status, JSON.stringify({ stderr: baseline.stderr, signal: baseline.signal, error: baseline.error })).toBe(0)
  const { alice, bob } = fixture()
  const policy = seatbeltProfileArgs({ mode: 'workspace-write', workspaceRoot: alice,
    readableRoots: ['/usr', '/bin', '/System', '/dev', '/Library', '/private/etc', '/private/var/db', alice] })
  const own = spawnSync('/usr/bin/sandbox-exec', [...policy, '--', '/bin/cat', join(alice, 'chat.txt')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
  expect(own.status, JSON.stringify({ stderr: own.stderr, signal: own.signal, error: own.error })).toBe(0)
  expect(own.stdout).toBe('alice conversation')
  const other = spawnSync('/usr/bin/sandbox-exec', [...policy, '--', '/bin/cat', join(bob, 'chat.txt')], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } })
  expect(other.status).not.toBe(0)
  expect(other.stdout).not.toContain('bob conversation')
})
