import { exec } from '../utils/process'
import * as core from '@actions/core'
import { strategyAsArgument, VersionStrategy } from './strategy'

type Params = {
  extraArgs?: string
  versionStrategy: VersionStrategy
}
export default async function versionPackages({ extraArgs, versionStrategy }: Params) {
  let command = `npx lerna version ${strategyAsArgument(
    versionStrategy
  )} --no-push --force-git-tag --yes --no-private --force-publish`
  if (extraArgs) command += ` ${extraArgs}`

  const { stdout } = await exec(command)
  core.debug(stdout)
}
