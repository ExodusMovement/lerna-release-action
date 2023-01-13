import * as fs from 'fs'
import { exec } from './process'
import { Filesystem } from './types'

const lockfileCommands = {
  'yarn.lock': 'yarn --no-immutable',
  'package-lock.json': 'npm install',
}

type Lockfile = keyof typeof lockfileCommands

type UpdateLockfileParams = { filesystem?: Filesystem }

export async function updateLockfile({ filesystem = fs }: UpdateLockfileParams = {}) {
  const lockfile = Object.keys(lockfileCommands).find((lockfile) =>
    filesystem.existsSync(lockfile)
  ) as Lockfile | undefined

  if (lockfile) {
    await exec(lockfileCommands[lockfile])
  }
}
