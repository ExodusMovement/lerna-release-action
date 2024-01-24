import * as core from '@actions/core'
import { Input, RELEASE_PR_LABEL } from './constants'
import * as github from '@actions/github'
import { Label } from './utils/types'
import { createTags } from './utils/github'
import { extractTags } from './publish/extract-tags'
import { spawnSync } from 'child_process'

async function publish() {
  const token = core.getInput(Input.GithubToken, { required: true })
  const client = github.getOctokit(token)

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

  core.info('Publishing yet unpublished packages')
  const { stdout } = spawnSync(
    'npx',
    ['lerna', 'publish', 'from-package', '--yes', '--no-private'],
    { encoding: 'utf8' }
  )
  core.debug(stdout)

  core.info('Identifying published packages')
  const tags = extractTags(stdout)

  if (!tags) {
    core.notice('No new packages versions found. Publish aborted.')
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
