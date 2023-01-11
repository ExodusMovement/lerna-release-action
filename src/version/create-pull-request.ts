import { createPullRequest as createGithubPullRequest } from '../utils/github'
import { truncate } from '../utils/strings'
import { GithubClient, Repo } from '../utils/types'
import * as path from 'path'

type Params = {
  client: GithubClient
  repo: Repo
  tags: string[]
  packages: string[]
  branch: string
  labels?: string[]
  assignees?: string[]
}
export default async function createPullRequest({
  client,
  tags,
  repo,
  branch,
  packages,
  labels,
  assignees,
}: Params) {
  const packageNames = packages.map((it) => path.basename(it))
  const packageList = packageNames.map((it) => `- ${it}`).join('\n')

  return createGithubPullRequest({
    repo,
    client,
    base: 'master',
    head: branch,
    title: truncate(`chore: release ${packageNames}`, 80),
    body: `## Release \n${packageList}\n## Tags\nThe following tags will be created automatically on merge:\n ${tags.join(
      '\n'
    )}`,
    labels,
    assignees,
  })
}
