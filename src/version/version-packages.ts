import { exec } from '../utils/process'
import * as core from '@actions/core'

type Params = {
  extraArgs: string
}
export default async function versionPackages({ extraArgs }: Params) {
  const { stdout } = await exec(
    `lerna version --conventional-commits --no-push --yes --no-private ${extraArgs}`
  )
  core.debug(stdout)
}
