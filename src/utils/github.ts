import * as core from '@actions/core'
import { GithubClient, Repo } from './types'
import * as github from '@actions/github'

type CreatePullRequestsParams = {
  client: GithubClient
  repo: Repo
  title: string
  assignees?: string[]
  base: string
  head: string
  body?: string
  labels?: string[]
}

export async function createPullRequest({
  client,
  repo,
  title,
  base,
  head,
  body,
  labels,
  assignees,
}: CreatePullRequestsParams) {
  core.debug(`Creating pull request in ${repo.owner}/${repo.owner} with base branch ${base}`)
  const response = await client.rest.pulls.create({
    ...repo,
    title,
    head,
    base,
    body,
  })

  const promises = []

  if (labels) {
    promises.push(
      client.rest.issues.addLabels({
        ...repo,
        issue_number: response.data.number,
        labels,
      })
    )
  }

  if (assignees) {
    promises.push(
      client.rest.issues.addAssignees({
        ...repo,
        issue_number: response.data.number,
        assignees,
      })
    )
  }

  await Promise.all(promises)
}

type CreateTagsParams = {
  client: GithubClient
  repo: Repo
  sha: string
  tags: string[]
}
export async function createTags({ client, repo, sha, tags }: CreateTagsParams) {
  await Promise.all(
    tags.map((tag) =>
      client.rest.git.createRef({
        ...repo,
        ref: `refs/tags/${tag.replace(/\r/, '')}`,
        sha,
      })
    )
  )
}
