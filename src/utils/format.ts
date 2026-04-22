import * as fs from 'fs'
import * as path from 'path'
import * as core from '@actions/core'
import { spawnSync } from './process'

type Params = {
  formatCommand?: string
  packages: string[]
  filesystem?: Pick<typeof fs, 'existsSync'>
}

const FORMATTED_FILES = ['CHANGELOG.md', 'package.json'] as const

export function formatPackageFiles({ formatCommand, packages, filesystem = fs }: Params) {
  if (!formatCommand?.trim()) return

  const files = packages.flatMap((packageDir) =>
    FORMATTED_FILES.map((name) => path.join(packageDir, name)).filter((file) =>
      filesystem.existsSync(file)
    )
  )

  if (files.length === 0) return

  const [command, ...args] = formatCommand.trim().split(/\s+/) as [string, ...string[]]
  core.info(`Formatting ${files.length} file(s) with \`${formatCommand}\``)
  spawnSync(command, [...args, ...files])
}
