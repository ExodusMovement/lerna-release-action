import * as core from '@actions/core'
import * as github from '@actions/github'
import { VersionDispatchInput as Input } from './constants'
import { Filesystem } from './utils/types'
import * as fs from 'fs'
import { getPackagePaths } from '@exodus/lerna-utils'
import * as path from 'path'
import { VersionStrategy } from './version/strategy'
import { parseMessage } from './utils/conventional-commits'

type Params = {
  filesystem?: Filesystem
}

export async function versionDispatch({ filesystem = fs }: Params = {}) {
  const token = core.getInput(Input.GithubToken, { required: true })
  const workflowId = core.getInput(Input.VersionWorkflowId)
  const ref = core.getInput(Input.Ref)
  const excludedCommitTypes = new Set(core.getInput(Input.ExcludeCommitTypes).split(','))
  const excludedLabels = new Set(core.getInput(Input.ExcludeLabels).split(','))

  const {
    repo,
    payload: { pull_request: pr },
  } = github.context

  if (!pr) {
    core.warning('Action triggered by non-PR related event.')
    return
  }

  if (!pr.merged) {
    core.notice('PR was closed without merging.')
    return
  }

  const { type: commitType } = parseMessage(pr.title)
  if (excludedCommitTypes.has(commitType)) {
    core.notice(`Skipped for excluded commit type "${commitType}"`)
    return
  }

  const excludedLabel = pr.labels.find((label: { name: string }) => excludedLabels.has(label.name))
  if (excludedLabel) {
    core.notice(`Skipped for excluded label "${excludedLabel}"`)
    return
  }

  const client = github.getOctokit(token)
  const packagePaths = await getPackagePaths({ filesystem })
  const affected = packagePaths.filter((it) =>
    pr.labels.some((label: { name: string }) => label.name === path.basename(it))
  )

  if (affected.length === 0) {
    core.notice('No packages were affected.')
    return
  }

  await client.rest.actions.createWorkflowDispatch({
    ref,
    ...repo,
    workflow_id: workflowId,
    inputs: {
      assignee: pr.user.login,
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
