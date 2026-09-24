import * as core from '@actions/core'
import * as github from '@actions/github'
import { ReleaseRefInput as Input } from './constants'
import { getReleasePr } from './utils/github'

export async function releaseRef() {
  const token = core.getInput(Input.GithubToken, { required: true })
  const client = github.getOctokit(token)
  const { repo, eventName, sha } = github.context

  // Same lookup as `publish`, so both agree on the commit to release.
  const pr = eventName === 'push' ? await getReleasePr({ client, repo, sha }) : undefined

  if (pr) {
    core.info(`${sha} is the merge of ${pr.html_url}. Release ${pr.head.sha}.`)
  } else {
    core.info(`${sha} is not the merge of a release PR. Release it as is.`)
  }

  core.setOutput('sha', pr?.head.sha ?? sha)
  core.setOutput('pr-number', pr ? String(pr.number) : '')
}

releaseRef().catch((error: Error) => {
  if (error.stack) {
    core.debug(error.stack)
  }

  core.setFailed(String(error.message))
})
