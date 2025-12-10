import * as core from '@actions/core'
import { PublishInput as Input } from './constants'
import * as github from '@actions/github'
import { createTags, getReleasePr } from './utils/github'
import { extractTags } from './publish/extract-tags'
import { spawnSync } from 'node:child_process'
import { checkoutPr } from './utils/git'

export async function publish() {
  const token = core.getInput(Input.GithubToken, { required: true })
  const requiredRulesets = core.getMultilineInput(Input.RequiredBranchRulesets)
  const client = github.getOctokit(token)
  const distTag = core.getInput(Input.DistTag)

  const { repo, eventName, sha } = github.context

  if (!['workflow_dispatch', 'push'].includes(eventName)) {
    core.info('Skipping action as it was neither triggered through push nor workflow_dispatch.')
    return
  }

  const pr = eventName === 'push' ? await getReleasePr({ client, repo, sha }) : undefined
  if (eventName === 'push' && !pr) {
    core.info('Skipping action as the pushed commit is not a release commit.')
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

  if (pr) {
    core.info(`Checking out ${pr.html_url} to avoid publishing more recent changes.`)
    await checkoutPr({ pr, client })
  }

  core.info('Publishing yet unpublished packages')

  const lernaArgs = ['lerna', 'publish', 'from-package', '--yes', '--no-private', '--summary-file']

  if (distTag) {
    lernaArgs.push('--dist-tag', distTag)
  }

  const { stdout, stderr, status } = spawnSync('npx', lernaArgs, {
    encoding: 'utf8',
    maxBuffer: Number.MAX_SAFE_INTEGER,
  })

  const lernaOutput = stdout + stderr

  if (status !== 0) {
    core.setFailed('Failed to publish some packages')
    core.error(lernaOutput)
  }

  core.debug(lernaOutput)

  core.info('Identifying published packages')
  const tags = extractTags()

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
