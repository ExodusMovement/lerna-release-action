import { parsePackageFiles } from '@exodus/lerna-utils'
import * as fs from 'fs'
import * as path from 'path'
import { Filesystem, PackageJson } from '../utils/types'

type Params = {
  filesystem?: Filesystem
  packagesCsv: string
}

export default async function normalizePackages({ packagesCsv, filesystem = fs }: Params) {
  const pkgs = await parsePackageFiles<PackageJson>('package.json', { filesystem })
  const byFolder = Object.fromEntries(
    pkgs.map((pkg) => {
      const folder = path.dirname(pkg.path)
      return [path.basename(folder), { path: folder, private: pkg.content.private }]
    })
  )

  const normalized = []
  const invalid = []

  const packages = packagesCsv.split(',')
  for (const thePackage of packages) {
    const trimmed = thePackage.trim()
    if (trimmed === '') continue

    const folderName = path.basename(trimmed)
    const pkg = byFolder[folderName]

    if (!pkg) {
      invalid.push(trimmed)
      continue
    }

    if (!pkg.private) {
      normalized.push(pkg.path)
    }
  }

  if (invalid.length > 0) {
    throw new Error(`Encountered invalid package inputs: ${invalid.join(', ')}`)
  }

  return normalized
}
