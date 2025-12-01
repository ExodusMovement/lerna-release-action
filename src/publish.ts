import * as core from '@actions/core'
import { PublishInput as Input, RELEASE_PR_LABEL } from './constants'
import * as github from '@actions/github'
import { Label } from './utils/types'
import { createTags } from './utils/github'
import { extractTags } from './publish/extract-tags'
import { spawnSync } from 'node:child_process'

export async function publish() {
  const token = core.getInput(Input.GithubToken, { required: true })
  const requiredRulesets = core.getMultilineInput(Input.RequiredBranchRulesets)
  const client = github.getOctokit(token)
  const distTag = core.getInput(Input.DistTag)

  const {
    repo,
    eventName,
    payload: { pull_request: pr },
  } = github.context

  const sha = pr?.merge_commit_sha ?? github.context.sha

  const isReleasePr = pr?.merged && pr.labels.some(({ name }: Label) => name === RELEASE_PR_LABEL)
  if (!(eventName === 'workflow_dispatch' || isReleasePr)) {
    core.info(
      'Skipped action as it was neither triggered through workflow_dispatch or merging of a release PR'
    )
    return
  }

  if (requiredRulesets.length > 0) {
    const publishBranch = pr?.base.ref ?? github.context.ref.replace(/^refs\/heads\//, '')
    const { data: rules } = await client.rest.repos.getBranchRules({
      ...repo,
      branch: publishBranch,
    })

    const ids = new Set(rules.map((it) => String(it.ruleset_id)))
    const missing = requiredRulesets.filter((it) => !ids.has(it))

    if (missing.length > 0) {
      core.setFailed(
        `Publishing from "${publishBranch}" is only possible if it is protected by the following rulesets: ${missing.join(', ')}`
      )
      return
    }
  }

  core.info('Publishing yet unpublished packages')

  const lernaArgs = ['lerna', 'publish', 'from-package', '--yes', '--no-private']

  if (distTag) {
    lernaArgs.push('--dist-tag', distTag)
  }

  const { stdout, stderr, status } = spawnSync('npx', lernaArgs, { encoding: 'utf8' })
  if (status !== 0) {
    core.setFailed('Failed to publish some packages')
    core.error(stderr)
    core.error(stdout)
  }

  core.debug(stdout)

  core.info('Identifying published packages')
  const tags = extractTags(stdout)

  if (tags.length === 0) {
    core.notice('No new packages versions found. Tagging aborted.')
    return
  }

  const publishedPackages = tags.join(',')
  core.notice(`Published the following versions: ${publishedPackages}`)

  core.info(`Adding tags to commit ${sha}`)
  await createTags({ client, repo, tags, sha })
  core.setOutput('published-packages', publishedPackages)
}

publish().catch((error: Error) => {
  if (error.stack) {
    core.debug(error.stack)
  }

  core.setFailed(String(error.message))
})
