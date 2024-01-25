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
  reviewers?: string[]
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
  reviewers,
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

  if (reviewers) {
    promises.push(
      client.rest.pulls.requestReviewers({
        ...repo,
        pull_number: response.data.number,
        reviewers: assignees,
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
  return response.data
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

type GetPullRequestsForLabelsResponse = {
  search: {
    edges: { node: { number: number; title: string; labels: { nodes: { name: string }[] } } }[]
  }
}

const SEARCH_PULL_REQUESTS_QUERY = `
query searchPullRequests($search: String!) {
  search(
    query: $search
    type: ISSUE
    first: 100
  ) {
    edges {
      node {
        ... on PullRequest {
          number
          title
          url
          labels(first: 100) {
            nodes {
              name
            }
          }
        }
      }
    }
  }
}`

type GetPullRequestForLabelsParams = {
  labels: string[]
  client: GithubClient
  repo: Repo
  state?: 'open' | 'closed'
}

export async function getPullRequestsForLabels({
  client,
  labels,
  repo,
  state = 'open',
}: GetPullRequestForLabelsParams) {
  const labelQuery = labels.map((label) => `label:${label}`).join(' ')
  const search = `repo:${repo.owner}/${repo.repo} is:pr state:${state} ${labelQuery}`
  const response = await client.graphql<GetPullRequestsForLabelsResponse>(
    SEARCH_PULL_REQUESTS_QUERY,
    { search }
  )

  return response.search.edges.map((edge) => edge.node)
}

type ClosePullRequestParams = {
  client: GithubClient
  number: number
  repo: Repo
}

export async function closePullRequest({ client, number, repo }: ClosePullRequestParams) {
  await client.rest.pulls.update({
    ...repo,
    pull_number: number,
    state: 'closed',
  })
}

type CommentOnIssueParams = {
  client: GithubClient
  number: number
  repo: Repo
  body: string
}

export async function commentOnIssue({ client, number, repo, body }: CommentOnIssueParams) {
  await client.rest.issues.createComment({
    ...repo,
    issue_number: number,
    body,
  })
}
