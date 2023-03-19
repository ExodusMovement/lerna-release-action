import * as core from '@actions/core'
import * as github from '@actions/github'
import { Input } from './constants'
import { Filesystem } from './utils/types'
import * as fs from 'fs'
import { getPackagePaths } from '@exodus/lerna-utils'
import * as path from 'path'
import { VersionStrategy } from './version/strategy'

type Params = {
  filesystem?: Filesystem
}

export async function versionDispatch({ filesystem = fs }: Params = {}) {
  const token = core.getInput(Input.GithubToken, { required: true })
  const workflowId = core.getInput(Input.VersionWorkflowId)
  const ref = core.getInput(Input.Ref)

  const {
    repo,
    payload: { pull_request: pr },
  } = github.context

  if (!pr) {
    core.warning('Action triggered by non-PR related event. Aborting')
    return
  }

  if (!pr.merged) {
    core.notice('PR was closed without merging. Aborting')
    return
  }

  const client = github.getOctokit(token)
  const packagePaths = await getPackagePaths({ filesystem })
  const affected = packagePaths.filter((it) =>
    pr.labels.some((label: { name: string }) => label.name === path.basename(it))
  )

  await client.rest.actions.createWorkflowDispatch({
    ref,
    ...repo,
    workflow_id: workflowId,
    inputs: {
      'version-strategy': VersionStrategy.ConventionalCommits,
      packages: affected.join(','),
    },
  })
}

versionDispatch().catch((error: Error) => {
  if (error.stack) {
    core.debug(error.stack)
  }
  core.setFailed(String(error.message))
})
