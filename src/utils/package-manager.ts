import * as fs from 'fs'
import { Filesystem } from './types'
import { spawnSync } from './process'

const lockfileCommands = {
  'yarn.lock': { command: 'yarn', args: ['--no-immutable'] },
  'package-lock.json': { command: 'npm', args: ['install'] },
}

type UpdateLockfileParams = { filesystem?: Filesystem }

export function updateLockfile({ filesystem = fs }: UpdateLockfileParams = {}) {
  for (const [lockfile, { command, args }] of Object.entries(lockfileCommands)) {
    if (filesystem.existsSync(lockfile)) {
      spawnSync(command, args)
      return
    }
  }
}
