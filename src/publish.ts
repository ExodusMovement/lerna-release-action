import * as core from '@actions/core'
import { Input, RELEASE_PR_LABEL } from './constants'
import * as github from '@actions/github'
import { exec } from './utils/process'
import { Label } from './utils/types'
import { createTags } from './utils/github'

async function publish() {
  const token = core.getInput(Input.GithubToken, { required: true })
  const client = github.getOctokit(token)

  const {
    repo,
    eventName,
    payload: { pull_request: pr },
  } = github.context

  const sha = pr?.base.sha ?? github.context.sha

  const isReleasePr = pr?.merged && pr.labels.some(({ name }: Label) => name === RELEASE_PR_LABEL)
  if (!(eventName === 'workflow_dispatch' || isReleasePr)) {
    core.info(
      'Skipped action as it was neither triggered through workflow_dispatch or merging of a release PR'
    )
    return
  }

  core.info('Publishing yet unpublished packages')
  const { stdout } = await exec('npx lerna publish from-package --yes')
  core.debug(stdout)

  core.info('Identifying published packages')
  const tags = stdout.match(/@exodus\/\S+@\d+\.\d+.\d+/g)

  if (!tags) {
    core.notice('No new packages versions found. Publish aborted.')
    return
  }

  core.notice(`Published the following versions: ${tags.join(', ')}`)

  core.info(`Adding tags tp commit ${sha}`)
  await createTags({ client, repo, tags, sha: pr?.base.sha ?? sha })
}

publish().catch((error) => {
  core.error(String(error))
  core.setFailed(String(error.message))
})
