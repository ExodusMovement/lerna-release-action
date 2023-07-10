import { createPullRequest as createGithubPullRequest, GithubClient } from '../utils/github'
import { truncate } from '../utils/strings'
import { Repo } from '../utils/types'
import * as path from 'path'

type Params = {
  client: GithubClient
  repo: Repo
  tags: string[]
  packages: string[]
  branch: string
  labels?: string[]
  assignees?: string[]
  autoMerge?: boolean
}

export default async function createPullRequest({
  client,
  tags,
  repo,
  branch,
  packages,
  labels,
  assignees,
  autoMerge,
}: Params) {
  const packageNames = packages.map((it) => path.basename(it))
  const packageList = packageNames.map((it) => `- ${it}`).join('\n')

  return createGithubPullRequest({
    repo,
    client,
    base: 'master',
    head: branch,
    title: truncate(`chore: release ${tags}`, 120),
    body: `## Release \n${packageList}\n## Tags\nThe following tags will be created automatically on merge:\n ${tags.join(
      '\n'
    )}`,
    labels,
    assignees,
    autoMerge,
  })
}
