import { getPackagePathsByFolder } from '@exodus/lerna-utils'
import * as fs from 'fs'
import * as path from 'path'
import { Filesystem } from '../utils/types'

type Params = {
  filesystem?: Filesystem
  packagesCsv: string
}

export default async function normalizePackages({ packagesCsv, filesystem = fs }: Params) {
  const byFolder = await getPackagePathsByFolder({ filesystem })

  const normalized = []
  const invalid = []

  const packages = packagesCsv.split(',')
  for (const thePackage of packages) {
    const trimmed = thePackage.trim()
    if (trimmed === '') continue

    const folderName = path.basename(trimmed)
    const packagePath = byFolder[folderName]

    if (!packagePath) {
      invalid.push(trimmed)
      continue
    }

    normalized.push(packagePath)
  }

  if (invalid.length > 0) {
    throw new Error(`Encountered invalid package inputs: ${invalid.join(', ')}`)
  }

  return normalized
}
