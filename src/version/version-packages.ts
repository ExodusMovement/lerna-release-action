import { exec } from '../utils/process'
import * as core from '@actions/core'
import { VersionStrategy } from './strategy'

type Params = {
  extraArgs?: string
  versionStrategy: VersionStrategy
}
export default async function versionPackages({ extraArgs, versionStrategy }: Params) {
  const strategy =
    versionStrategy === VersionStrategy.ConventionalCommits
      ? '--conventional-commits'
      : versionStrategy

  let command = `lerna version ${strategy} --no-push --yes --no-private`
  if (extraArgs) command += ` ${extraArgs}`

  const { stdout } = await exec(command)
  core.debug(stdout)
}
