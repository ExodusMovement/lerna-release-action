import * as path from 'path'
import { getPackageNameByPath, getPackagePaths } from '../utils/package'
import { Filesystem, PackageContentByPath, PackageJson } from '../utils/types'
import { readJson } from '../utils/fs'
import * as fs from 'fs'
import * as core from '@actions/core'

type Params = {
  packages: string[]
  filesystem?: Filesystem
  previousPackageContents: PackageContentByPath
}

/**
 * Reverts changes to versions of workspaces dependencies that were not selected for versioning
 */
export default async function revertUnwantedDependencyChanges({
  packages: selected,
  previousPackageContents,
  filesystem = fs,
}: Params) {
  const all = await getPackagePaths({ filesystem })

  const unselected = all.filter((packagePath) => !selected.includes(packagePath))
  const unselectedPackageNames = await Promise.all(
    unselected.map((it) => getPackageNameByPath(it, { filesystem }))
  )

  await Promise.all(
    selected.map((packageFolder) =>
      updateJson<PackageJson>(
        path.join(packageFolder, 'package.json'),
        async (pkgJson) => {
          /* eslint-disable @exodus/mutable/no-param-reassign-prop-only */

          const before = previousPackageContents[packageFolder]

          for (const name of unselectedPackageNames) {
            if (!name) continue

            if (pkgJson.dependencies?.[name]) {
              const previousVersion = before?.dependencies?.[name]
              core.debug(
                `Reset dependency ${name} from version ${pkgJson.dependencies[name]} to version ${previousVersion}`
              )
              pkgJson.dependencies[name] = previousVersion
            }

            if (pkgJson.devDependencies?.[name]) {
              const previousVersion = before?.devDependencies?.[name]
              core.debug(
                `Reset dev dependency ${name} from version ${pkgJson.devDependencies[name]} to version ${previousVersion}`
              )
              pkgJson.devDependencies[name] = previousVersion
            }
          }

          return pkgJson
        },
        { filesystem }
      )
    )
  )
}

async function updateJson<T>(
  relativePath: string,
  update: (json: T) => Promise<T>,
  { filesystem = fs }: { filesystem?: Filesystem } = {}
) {
  const json = await readJson<T>(relativePath, { filesystem })
  if (!json) return

  const updated = await update(json)
  await filesystem.promises.writeFile(relativePath, JSON.stringify(updated))
}
