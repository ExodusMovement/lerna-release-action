import {
  closePullRequest,
  commentOnIssue,
  createPullRequest,
  getPullRequestsForLabels,
  GithubClient,
} from '../utils/github'
import { RELEASE_PR_LABEL } from '../constants'
import * as path from 'path'
import { Repo } from '../utils/types'
import * as core from '@actions/core'

type Params = {
  client: GithubClient
  repo: Repo
  packages: string[]
  pullRequest: Awaited<ReturnType<typeof createPullRequest>>
}

export default async function closePreviousPrs({ client, repo, pullRequest, packages }: Params) {
  const labels = [RELEASE_PR_LABEL, ...packages.map((it) => path.basename(it))]

  const previousPrs = await getPullRequestsForLabels({ client, repo, labels })

  if (previousPrs.length === 0) {
    core.info('Found no previous PRs releasing the same packages.')
    return
  }

  core.info(`Found ${previousPrs.length} previous PRs releasing the same packages. Closing`)

  const comment = `Closing in favor of ${pullRequest.html_url}`

  const promises = previousPrs.flatMap((pr) => [
    closePullRequest({ client, repo, number: pr.number }),
    commentOnIssue({ client, number: pr.number, repo, body: comment }),
  ])

  await Promise.all(promises)
}
