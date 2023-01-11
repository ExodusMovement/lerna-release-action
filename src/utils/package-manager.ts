import * as fs from 'fs'
import { exec } from './process'
import { Filesystem } from './types'

const lockfileCommands = Object.entries({
  'yarn.lock': 'yarn --no-immutable',
  'package-lock.json': 'npm install',
})

type UpdateLockfileParams = { filesystem?: Filesystem }

export async function updateLockfile({ filesystem = fs }: UpdateLockfileParams = {}) {
  for (const [lockfile, command] of lockfileCommands) {
    if (!filesystem.existsSync(lockfile)) {
      continue
    }

    await exec(command)
    return
  }
}
