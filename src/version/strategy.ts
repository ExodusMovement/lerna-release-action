import { Filesystem, PackageJson } from '../utils/types'
import * as fs from 'fs'
import { getPackageNameByPath } from '../utils/package'
import { readJson } from '../utils/fs'

export enum VersionStrategy {
  ConventionalCommits = 'conventional-commits',
  Patch = 'patch',
  Minor = 'minor',
  Major = 'major',
  Premajor = 'premajor',
  Preminor = 'preminor',
  Prepatch = 'prepatch',
  Prerelease = 'prerelease',
}

export function assertStrategy(input: unknown): asserts input is VersionStrategy {
  const strategies: unknown[] = Object.values(VersionStrategy)

  if (!strategies.includes(input)) {
    throw new Error(
      `Invalid version strategy ${input} provided. Permitted values are ${strategies}`
    )
  }
}

type ValidateParams = {
  packages: string[]
  filesystem?: Filesystem
  versionStrategy: VersionStrategy
}
export async function validateAllowedStrategies({
  packages,
  versionStrategy,
  filesystem = fs,
}: ValidateParams) {
  const packageJson = await readJson<PackageJson>('package.json', { filesystem })
  if (!packageJson?.release?.versionStrategy) {
    return
  }

  const packageNames = new Set(
    await Promise.all(
      packages.map((packagePath) => getPackageNameByPath(packagePath, { filesystem }))
    )
  )

  for (const [packageName, allowedStrategies] of Object.entries(
    packageJson.release.versionStrategy
  )) {
    if (packageNames.has(packageName) && !allowedStrategies.includes(versionStrategy)) {
      throw new Error(
        `Attempted to use version strategy "${versionStrategy}", which is not allowed for ${packageName}. Allowed strategies are: ${allowedStrategies.join(
          ', '
        )}`
      )
    }
  }
}

export function strategyAsArgument(strategy: VersionStrategy): string {
  return strategy === VersionStrategy.ConventionalCommits ? '--conventional-commits' : strategy
}
