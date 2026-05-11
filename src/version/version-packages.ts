import * as core from '@actions/core'
import { strategyAsArgument, VersionStrategy } from './strategy'
import { spawnSync } from '../utils/process'

type Params = {
  extraArgs?: string
  versionStrategy: VersionStrategy
}

function versionPackages({ extraArgs, versionStrategy }: Params) {
  const args = [
    'lerna',
    'version',
    strategyAsArgument(versionStrategy),
    '--no-push',
    '--force-git-tag',
    '--yes',
    '--no-private',
    '--force-publish',
  ]

  if (extraArgs) {
    args.push(...extraArgs.split(' '))
  }

  const stdout = spawnSync('npx', args, { encoding: 'utf8' })
  core.debug(stdout)
}

type ExplicitParams = {
  bumps: Record<string, string>
  extraArgs?: string
}

/**
 * Drives `lerna version` once per entry in the `bumps` map, each invocation
 * scoped to a single package with an explicit bump (patch | minor | major |
 * prerelease | etc.).
 *
 * Each call produces its own commit + tag. The caller is responsible for
 * collapsing the N commits into one (via `git reset --mixed HEAD~N`) before
 * pushing — the return value carries the count.
 *
 * @returns the number of commits created (= number of entries in `bumps`).
 */
export function versionPackagesExplicit({ bumps, extraArgs }: ExplicitParams): number {
  const entries = Object.entries(bumps)
  for (const [pkg, bump] of entries) {
    const args = [
      'lerna',
      'version',
      bump,
      '--scope',
      pkg,
      '--no-push',
      '--force-git-tag',
      '--yes',
      '--no-private',
      '--force-publish',
    ]

    if (extraArgs) {
      args.push(...extraArgs.split(' '))
    }

    core.info(`Running: npx ${args.join(' ')}`)
    const stdout = spawnSync('npx', args, { encoding: 'utf8' })
    core.debug(stdout)
  }

  return entries.length
}

export default versionPackages
