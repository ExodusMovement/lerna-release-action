import * as core from '@actions/core'
import * as github from '@actions/github'

import { Repo } from './types'

export type GithubClient = ReturnType<typeof github.getOctokit>

type EnablePullRequestAutoMergeResponse = {
  enablePullRequestAutoMerge: {
    pullRequest: {
      autoMergeRequest: {
        enabledAt: Date
      }
    }
  }
}

type CreatePullRequestsParams = {
  client: GithubClient
  repo: Repo
  title: string
  assignees?: string[]
  base: string
  head: string
  body?: string
  labels?: string[]
  autoMerge?: boolean
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
  autoMerge,
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

  if (autoMerge) {
    const autoMergePromise = client.graphql<EnablePullRequestAutoMergeResponse>(
      `mutation enableAutoMerge($pullRequestId: ID!) {
        enablePullRequestAutoMerge(input: {
          pullRequestId: $pullRequestId,
          mergeMethod: SQUASH,
        }) {
          pullRequest {
            autoMergeRequest {
              enabledAt
            }
          }
        }
      }`,
      {
        pullRequestId: response.data.node_id,
      }
    )

    promises.push(autoMergePromise)
    autoMergePromise.then(({ enablePullRequestAutoMerge: { pullRequest } }) =>
      core.debug(`Auto-merge enabled at ${pullRequest.autoMergeRequest.enabledAt}`)
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
