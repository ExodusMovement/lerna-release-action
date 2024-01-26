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
import { getPackagePaths } from '@exodus/lerna-utils'

type Params = {
  client: GithubClient
  repo: Repo
  packages: string[]
  pullRequest: Awaited<ReturnType<typeof createPullRequest>>
}

export default async function closePreviousPrs({ client, repo, pullRequest, packages }: Params) {
  const allPackages = await getPackagePaths()
  const allPackageNames = new Set(allPackages.map((it) => path.basename(it)))
  const labels = [RELEASE_PR_LABEL, ...packages.map((it) => path.basename(it))]
  const previousPrs = await getPullRequestsForLabels({ client, repo, labels })

  const filtered = previousPrs.filter(
    (pr) =>
      pr.number !== pullRequest.number &&
      pr.labels.nodes.every(
        (label) => labels.includes(label.name) || !allPackageNames.has(label.name)
      )
  )

  if (filtered.length === 0) {
    core.info('Found no previous PRs releasing the same packages.')
    return
  }

  core.info(`Found ${filtered.length} previous PRs releasing the same packages. Closing`)

  const comment = `Closing in favor of ${pullRequest.html_url}`

  const promises = filtered.flatMap((pr) => [
    closePullRequest({ client, repo, number: pr.number }),
    commentOnIssue({ client, number: pr.number, repo, body: comment }),
  ])

  await Promise.all(promises)
}
