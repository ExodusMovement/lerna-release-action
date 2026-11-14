import * as core from '@actions/core'
import * as github from '@actions/github'
import retry from 'p-retry'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { Repo } from './types'
import { unwrapErrorMessage } from './errors'
import { RELEASE_PR_LABEL } from '../constants'

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
  draft?: boolean
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
  draft,
  reviewers,
}: CreatePullRequestsParams) {
  core.debug(`Creating pull request in ${repo.owner}/${repo.owner} with base branch ${base}`)
  const response = await client.rest.pulls.create({
    ...repo,
    title,
    head,
    base,
    body,
    draft,
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
      client.rest.issues
        .addAssignees({
          ...repo,
          issue_number: response.data.number,
          assignees,
        })
        .catch((error) => {
          core.warning(
            `Failed to assign users: ${unwrapErrorMessage(error, 'for unknown reasons')}`
          )
        })
    )
  }

  if (reviewers) {
    promises.push(
      client.rest.pulls
        .requestReviewers({
          ...repo,
          pull_number: response.data.number,
          reviewers,
        })
        .catch((error) => {
          core.warning(
            `Failed to request reviewers: ${unwrapErrorMessage(error, 'for unknown reasons')}`
          )
        })
    )
  }

  if (autoMerge) {
    const autoMergePromise = client
      .graphql<EnablePullRequestAutoMergeResponse>(
        /* GraphQL */ `
          mutation EnableAutoMerge($pullRequestId: ID!) {
            enablePullRequestAutoMerge(
              input: { pullRequestId: $pullRequestId, mergeMethod: SQUASH }
            ) {
              pullRequest {
                autoMergeRequest {
                  enabledAt
                }
              }
            }
          }
        `,
        {
          pullRequestId: response.data.node_id,
        }
      )
      .then(({ enablePullRequestAutoMerge: { pullRequest } }) =>
        core.debug(`Auto-merge enabled at ${pullRequest.autoMergeRequest.enabledAt}`)
      )
      .catch((error) => {
        core.warning(
          `Failed to enable auto-merge: ${unwrapErrorMessage(error, 'for unknown reasons')}`
        )
      })

    promises.push(autoMergePromise)
  }

  await Promise.all(promises)
  return response.data
}

type RequestFailure = { status?: number; errors?: { type?: string }[] }

// Octokit reports a dead keep-alive socket as a 500, so 5xx and rate limits get
// another attempt; a 4xx or a GraphQL `errors` response never becomes valid.
function isPermanent(error: unknown): boolean {
  const { status, errors } = error as RequestFailure
  if (errors?.some(({ type }) => type === 'RATE_LIMITED')) return false
  if (errors) return true

  return status !== undefined && status < 500 && status !== 403 && status !== 429
}

export async function retryRequest<T>(description: string, request: () => Promise<T>): Promise<T> {
  const attempt = async () => {
    try {
      return await request()
    } catch (error) {
      if (isPermanent(error)) throw new retry.AbortError(error as Error)

      throw error
    }
  }

  return retry(attempt, {
    retries: 5,
    onFailedAttempt: (error) => {
      core.warning(
        `Failed to ${description}: ${error.message}. There are ${error.retriesLeft} retries left`
      )
    },
  })
}

type CreateRefParams = {
  client: GithubClient
  repo: Repo
  sha: string
  ref: string
}

async function createRef({ client, ref, sha, repo }: CreateRefParams) {
  try {
    await client.rest.git.createRef({
      ...repo,
      ref,
      sha,
    })
  } catch (e) {
    if (e instanceof Error && e.message.includes('Reference already exists')) {
      return
    }

    throw e
  }
}

type CreateSignedCommitParams = {
  client: GithubClient
  repo: Repo
  branch: string
  expectedHeadOid: string
  headline: string
  body?: string
  additions: string[]
  // Absolute repo root used to read each addition's contents from disk. The
  // addition paths stay repo-root-relative for the API; only the on-disk read
  // is rebased so the commit works when the action runs in a subdirectory.
  // Defaults to reading additions relative to the current working directory.
  repoRoot?: string
}

type CreateCommitOnBranchResponse = {
  createCommitOnBranch: {
    commit: {
      oid: string
    }
  }
}

type FindLandedCommitParams = {
  client: GithubClient
  repo: Repo
  branch: string
  expectedHeadOid: string
  headline: string
}

// A lost response leaves the commit on the branch, where resending would fail the head check.
async function findLandedCommit({
  client,
  repo,
  branch,
  expectedHeadOid,
  headline,
}: FindLandedCommitParams): Promise<string | undefined> {
  const { data: ref } = await client.rest.git.getRef({ ...repo, ref: `heads/${branch}` })
  const sha = ref.object.sha
  if (sha === expectedHeadOid) return undefined

  const { data: commit } = await client.rest.git.getCommit({ ...repo, commit_sha: sha })
  const ours =
    commit.message.split('\n', 1)[0] === headline && commit.parents[0]?.sha === expectedHeadOid
  if (!ours) {
    throw new retry.AbortError(
      new Error(`Branch ${branch} moved to ${sha}, which is not our commit on ${expectedHeadOid}`)
    )
  }

  return sha
}

// Creates the release branch and commits the changed files onto it via the
// GraphQL `createCommitOnBranch` mutation, producing a commit signed with
// GitHub's GPG key (shown as "Verified"). The commit author is the identity of
// the authenticated token; the committer is GitHub itself. File contents are
// read from the working tree, which matches the local HEAD after the amend.
export async function createSignedCommit({
  client,
  repo,
  branch,
  expectedHeadOid,
  headline,
  body,
  additions,
  repoRoot = '',
}: CreateSignedCommitParams): Promise<string> {
  const ref = `refs/heads/${branch}`
  await retryRequest(`create ref ${ref}`, () =>
    createRef({ client, repo, ref, sha: expectedHeadOid })
  )

  const fileAdditions = await Promise.all(
    additions.map(async (path) => {
      const contents = await readFile(repoRoot ? resolve(repoRoot, path) : path, {
        encoding: 'base64',
      })
      return { path, contents }
    })
  )

  let sent = false
  return retryRequest(`create signed commit on ${branch}`, async () => {
    if (sent) {
      const landed = await findLandedCommit({ client, repo, branch, expectedHeadOid, headline })
      if (landed) return landed
    }

    sent = true
    const { createCommitOnBranch } = await client.graphql<CreateCommitOnBranchResponse>(
      /* GraphQL */ `
        mutation CreateCommitOnBranch($input: CreateCommitOnBranchInput!) {
          createCommitOnBranch(input: $input) {
            commit {
              oid
            }
          }
        }
      `,
      {
        input: {
          branch: {
            repositoryNameWithOwner: `${repo.owner}/${repo.repo}`,
            branchName: branch,
          },
          message: { headline, body },
          expectedHeadOid,
          fileChanges: {
            additions: fileAdditions,
          },
        },
      }
    )

    return createCommitOnBranch.commit.oid
  })
}

type CreateTagsParams = {
  client: GithubClient
  repo: Repo
  sha: string
  tags: string[]
}

export async function createTags({ client, repo, sha, tags }: CreateTagsParams) {
  await Promise.all(
    tags.map((tag) => {
      const ref = `refs/tags/${tag.replace(/\r/, '')}`

      const createTag = () =>
        createRef({
          client,
          repo,
          sha,
          ref,
        })

      return retry(createTag, {
        retries: 5,
        onFailedAttempt: (error) => {
          core.warning(
            `Failed to create ref ${ref}: ${error.message}. There are ${error.retriesLeft} retries left`
          )
        },
      })
    })
  )
}

type GetPullRequestsForLabelsResponse = {
  search: {
    edges: { node: { number: number; title: string; labels: { nodes: { name: string }[] } } }[]
  }
}

const SEARCH_PULL_REQUESTS_QUERY = /* GraphQL */ `
  query SearchPullRequests($search: String!) {
    search(query: $search, type: ISSUE, first: 100) {
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
  }
`

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

type GetDefaultBranchParams = {
  client: GithubClient
  repo: Repo
}

export async function getDefaultBranch({ client, repo }: GetDefaultBranchParams) {
  const {
    data: { default_branch: defaultBranch },
  } = await client.rest.repos.get(repo)

  return defaultBranch
}

type GetReleasePrParams = {
  client: GithubClient
  repo: Repo
  sha: string
}

export async function getReleasePr({ client, repo, sha }: GetReleasePrParams) {
  const { data } = await client.rest.repos.listPullRequestsAssociatedWithCommit({
    ...repo,
    commit_sha: sha,
  })

  return data.find((pr) => pr.merged_at && pr.labels.some(({ name }) => name === RELEASE_PR_LABEL))
}
