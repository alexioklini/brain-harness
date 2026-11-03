/** Package the built Brain gateway using the shared executable dependency closure. */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pnpmInvocation, restoreLegacyHoists } from './executable-packaging.ts'
import { materializeStagedLinks, deduplicateStagedWorkspacePackages } from './build-exe-for-python-sdk-staging.ts'

const root = resolve(import.meta.dirname, '..')
const commit = execFileSync('python3', ['scripts/release_guard.py'], { cwd: root, encoding: 'utf8' }).trim()
const destination = join(root, '.artifacts', `brain-${commit}`)
const run = (...args: string[]): void => {
  const [command, argv] = pnpmInvocation(args)
  execFileSync(command, argv, { cwd: root, stdio: 'inherit' })
}
await mkdir(join(root, '.artifacts'), { recursive: true })
try {
  run('--filter', 'dsh-python-runtime-closure', 'deploy', '--legacy', '--prod', '--config.allow-unused-patches=true',
    '--config.node-linker=hoisted', '--config.auto-install-peers=false', '--config.link-workspace-packages=true',
    '--config.hoist-workspace-packages=false', destination)
} finally {
  run('install', '--offline', '--frozen-lockfile', '--prod=false', '--ignore-scripts')
}
await restoreLegacyHoists(destination, join(root, 'python/sdk-runtime/node_modules'))
await materializeStagedLinks(destination)
await deduplicateStagedWorkspacePackages(destination, root)
execFileSync(process.execPath, [join(destination, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--version'], { stdio: 'inherit' })
await writeFile(join(destination, 'brain-release.json'), JSON.stringify({ commit, platform: process.platform, arch: process.arch }) + '\n')
const archive = destination + '.tar.gz'
execFileSync('tar', ['-czf', archive, '-C', destination, '.'], { stdio: 'inherit' })
const checksum = createHash('sha256').update(readFileSync(archive)).digest('hex')
await writeFile(archive + '.sha256', `${checksum}  brain-${commit}.tar.gz\n`)
console.log(JSON.stringify({ commit, archive, sha256: checksum }))
