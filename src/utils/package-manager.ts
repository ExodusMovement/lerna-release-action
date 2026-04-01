import * as fs from 'fs'
import { Filesystem } from './types'
import { spawnSync } from './process'

const packageManagers = {
  yarn: { lockfile: 'yarn.lock', command: 'yarn', args: ['--no-immutable'] },
  pnpm: { lockfile: 'pnpm-lock.yaml', command: 'pnpm', args: ['install', '--frozen-lockfile', 'false'] },
  npm: { lockfile: 'package-lock.json', command: 'npm', args: ['install'] },
} as const

const lockfileCommands = {
  'yarn.lock': { command: 'yarn', args: ['--no-immutable'] },
  'pnpm-lock.yaml': { command: 'pnpm', args: ['install', '--frozen-lockfile', 'false'] },
  'package-lock.json': { command: 'npm', args: ['install'] },
} as const

type UpdateLockfileParams = { filesystem?: Filesystem }

function readJson<T>(relativePath: string, filesystem: Filesystem): T | undefined {
  try {
    return JSON.parse(filesystem.readFileSync(relativePath, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return

    return
  }
}

function parsePackageManager(packageManager?: string) {
  return packageManager?.match(/^(pnpm|yarn|npm)(?:@|$)/)?.[1] as keyof typeof packageManagers | undefined
}

function detectPackageManager(filesystem: Filesystem) {
  const rootPackageJson = readJson<{ packageManager?: string }>('package.json', filesystem)
  const lernaJson = readJson<{ npmClient?: keyof typeof packageManagers }>('lerna.json', filesystem)

  const configuredPackageManager =
    parsePackageManager(rootPackageJson?.packageManager) ?? lernaJson?.npmClient

  if (configuredPackageManager) {
    return packageManagers[configuredPackageManager]
  }

  for (const [lockfile, { command, args }] of Object.entries(lockfileCommands)) {
    if (filesystem.existsSync(lockfile)) {
      return { command, args }
    }
  }
}

export function updateLockfile({ filesystem = fs }: UpdateLockfileParams = {}) {
  const packageManager = detectPackageManager(filesystem)

  if (!packageManager) {
    throw new Error(
      'Unable to determine package manager: expected packageManager/npmClient or a supported lockfile.'
    )
  }

  spawnSync(packageManager.command, [...packageManager.args])
}
