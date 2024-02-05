import * as core from '@actions/core'
import { strategyAsArgument, VersionStrategy } from './strategy'
import { spawnSync } from '../utils/process'

type Params = {
  extraArgs?: string
  versionStrategy: VersionStrategy
}
export default function versionPackages({ extraArgs, versionStrategy }: Params) {
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
