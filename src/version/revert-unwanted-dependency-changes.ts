import * as path from 'path'
import { Filesystem, PackageContentByPath, PackageJson } from '../utils/types'
import { readJson } from '../utils/fs'
import * as fs from 'fs'
import * as core from '@actions/core'
import { getPackageNameByPath, getPackagePaths } from '@exodus/lerna-utils'

type Params = {
  packages: string[]
  filesystem?: Filesystem
  previousPackageContents: PackageContentByPath
}

/**
 * Reverts changes to versions of workspaces dependencies that were not selected for versioning
 *
 * Explanation:
 *
 * Imagine a module A that has module B as dependency. If we select module A to be included but not module B,
 * `lerna version` would create the diff below. Lerna bumps a version of a package, including the version of a
 * dependency on that package in other workspace packages, whenever there are changes, and we happen to have
 * `feat!: some massive feat including breaking changes` commit for B.:
 *
 * ```diff
 * {
 *   "name": "module-a",
 * - "version": "1.0.0",
 * + "version": "1.0.1"
 *   "dependencies": {
 * -    "module-b": "1.0.0"
 * +    "module-b": "2.0.0"
 *   }
 * }
 * ```
 *
 * We cannot simply reset the entire file because we need the bump for module-a's own version. As an easy workaround,
 * we store the package.json contents prior to the lerna version step, resulting in the following contents for the key
 * `modules/module-a` in our previousPackageContents object:
 *
 * ```js
 * {
 *   name: 'module-a',
 *   version: '1.0.0',
 *   dependencies: {
 *     'module-b': '1.0.0'
 *   }
 * }
 * ```
 *
 * For every package to be included in the release, we iterate through every package **not** to be included in the
 * release, and if the not-to-be-included package is found in either `devDependencies` or `dependencies`, it's version
 * is set back to it was prior to calling `lerna version`, aka what's in previousPackageContents
 * under `<package-root>/<package-name>`
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
