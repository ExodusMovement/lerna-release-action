import { parsePackageFiles } from '@exodus/lerna-utils'
import * as fs from 'fs'
import * as path from 'path'
import { Filesystem, PackageJson } from '../utils/types'

type Params = {
  filesystem?: Filesystem
  packagesCsv: string
}

type PackageDetails = { path: string; private?: boolean }

export default async function normalizePackages({ packagesCsv, filesystem = fs }: Params) {
  const pkgs = await parsePackageFiles<PackageJson>('package.json', { filesystem })

  const byFolder = new Map<string, PackageDetails>()
  const byName = new Map<string, PackageDetails>()

  for (const pkg of pkgs) {
    const folder = path.dirname(pkg.path)
    const entry = { path: folder, private: pkg.content.private }

    byFolder.set(path.basename(folder), entry)
    byName.set(pkg.content.name, entry)
  }

  const normalized = []
  const invalid = []

  const packages = packagesCsv.split(',')
  for (const thePackage of packages) {
    const trimmed = thePackage.trim()
    if (trimmed === '') continue

    const folderName = path.basename(trimmed)
    const pkg = byName.get(trimmed) ?? byFolder.get(folderName)

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
