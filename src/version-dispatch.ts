import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import pLimit = require('p-limit')
import { getPathsByPackageNames } from '@exodus/lerna-utils'
import { VersionDispatchInput as Input } from './constants'
import { Filesystem } from './utils/types'
import { Bump, BUMP_NONE, bumpFromMessage, maxBump } from './version-dispatch/bumps'
import { filesToPackages } from './version-dispatch/files-to-packages'
import { clearVersionPreview, postVersionPreview } from './version-dispatch/preview'

type Params = {
  filesystem?: Filesystem
}

const GET_COMMIT_CONCURRENCY = 10

if (require.main === module) {
  versionDispatch().catch((error: Error) => {
    if (error.stack) core.debug(error.stack)
    core.setFailed(String(error.message))
  })
}

/**
 * Inspect a merged PR's pre-squash commits, attribute each commit to
 * workspace packages by the files it touched, derive a per-package bump
 * level from each commit's conventional-commit subject (max bump wins
 * per package), and dispatch the version workflow with a `{ pkg: bump }`
 * JSON map plus the matching `packages` list.
 *
 * Title fallback — if no commit carries a release-worthy type, parse the
 * PR title once and apply that bump to every workspace touched anywhere
 * in the PR. Preserves the long-standing PR-title-is-the-release-level
 * workflow for repos whose individual commits aren't conventional.
 *
 * The dispatched workflow is expected to forward `packages` and `bumps`
 * to `lerna-release-action/version`. When `bumps` is unset that action
 * falls back to the old `version-strategy` flow, so consumers that
 * haven't updated their `version.yml` to forward `bumps` keep working.
 *
 * Preview mode — when invoked against a PR that has *not* been merged
 * (e.g. `pull_request: synchronize` runs), the action skips the
 * dispatch entirely and instead posts a sticky comment to the PR with
 * the computed bumps and the resulting `current → next` versions. On
 * every run the prior preview comment is deleted and a fresh one
 * created, so reviewers always see exactly one preview comment,
 * anchored at the end of the conversation timeline.
 */
export async function versionDispatch({ filesystem = fs }: Params = {}) {
  const token = core.getInput(Input.GithubToken, { required: true })
  const workflowId = core.getInput(Input.VersionWorkflowId) || 'version.yml'
  const ref = core.getInput(Input.Ref) || 'master'
  const excludedLabels = new Set(
    core
      .getInput(Input.ExcludeLabels)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
  const dryRun = core.getInput(Input.DryRun) === 'true'
  const prNumberInput = core.getInput(Input.PrNumber)

  const { repo, payload } = github.context
  const client = github.getOctokit(token)

  let pr: PullRequest | null = null
  if (prNumberInput) {
    const { data } = await client.rest.pulls.get({ ...repo, pull_number: Number(prNumberInput) })
    pr = data as PullRequest
  } else if (payload.pull_request) {
    pr = payload.pull_request as PullRequest
  } else {
    core.warning('Action triggered by non-PR event and no `pr-number` was supplied.')
    return null
  }

  const isMerged = pr.merged === true
  const isPreview = !isMerged && pr.state !== 'closed'

  if (!isMerged && !isPreview) {
    core.notice('PR was closed without merging.')
    return null
  }

  const excludedLabel = (pr.labels ?? []).find((label) => excludedLabels.has(label.name))
  if (excludedLabel) {
    core.notice(`Skipped for excluded label "${excludedLabel.name}"`)
    if (isPreview) await clearVersionPreview({ client, repo, prNumber: pr.number })
    return null
  }

  const {
    data: { default_branch: defaultBranch },
  } = await client.rest.repos.get(repo)

  if (pr.base?.ref && pr.base.ref !== defaultBranch) {
    core.notice(`Skipped versioning for PR not targeting ${defaultBranch}`)
    if (isPreview) await clearVersionPreview({ client, repo, prNumber: pr.number })
    return null
  }

  const packagePaths = await getPathsByPackageNames({ filesystem })
  if (Object.keys(packagePaths).length === 0) {
    core.warning('No workspace packages discovered. Aborting.')
    if (isPreview) await clearVersionPreview({ client, repo, prNumber: pr.number })
    return null
  }

  const bumps = await computeBumpsForPr({
    client,
    repo,
    prNumber: pr.number,
    packagePaths,
    prTitle: pr.title,
  })

  const packageNames = Object.keys(bumps)
  core.setOutput('packages', packageNames.join(','))
  core.setOutput('bumps', JSON.stringify(bumps))

  if (isPreview) {
    await postVersionPreview({
      client,
      repo,
      prNumber: pr.number,
      bumps,
      packagePaths,
      filesystem,
    })
    return bumps
  }

  if (packageNames.length === 0) {
    core.notice('No releaseable commits across workspace packages.')
    return null
  }

  if (dryRun) {
    core.info(`dry-run: bumps = ${JSON.stringify(bumps, null, 2)}`)
    return bumps
  }

  try {
    await client.rest.actions.createWorkflowDispatch({
      ref,
      ...repo,
      workflow_id: workflowId,
      inputs: {
        assignee: pr.user?.login ?? '',
        packages: packageNames.join(','),
        bumps: JSON.stringify(bumps),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    core.setFailed(`Failed to dispatch ${workflowId}: ${message}`)
    return bumps
  }

  core.info(`Dispatched ${workflowId} with bumps ${JSON.stringify(bumps)}`)
  return bumps
}

type PullRequest = {
  number: number
  title: string
  merged?: boolean
  state?: string
  labels?: { name: string }[]
  user?: { login: string }
  base?: { ref: string }
}

type ComputeBumpsParams = {
  client: ReturnType<typeof github.getOctokit>
  repo: { owner: string; repo: string }
  prNumber: number
  packagePaths: Record<string, string>
  prTitle: string
}

type CommitWithFiles = {
  sha: string
  message: string
  files: string[]
}

/**
 * Walk a PR's individual commits and build a `{ pkg: bump }` map.
 *
 * I/O — paginates the PR's commits and fetches each commit's file list
 * in parallel. The pure aggregation logic lives in {@link aggregateBumps}.
 *
 * @returns map keyed by workspace package name, with values from the
 *   `Bump` type *minus* `none` — packages that received no bump are omitted.
 */
export async function computeBumpsForPr({
  client,
  repo,
  prNumber,
  packagePaths,
  prTitle,
}: ComputeBumpsParams): Promise<Record<string, Bump>> {
  const commits = await client.paginate(client.rest.pulls.listCommits, {
    ...repo,
    pull_number: prNumber,
    per_page: 100,
  })

  if (commits.length >= 250) {
    core.warning(
      `PR #${prNumber} returned ${commits.length} commits, which is at or above GitHub's REST cap; some commits may have been truncated and missed by per-package attribution.`
    )
  }

  // Cap concurrency to avoid GitHub's secondary rate limit on PRs with
  // many commits. 10 is well under the per-second ceiling while still
  // ~10x faster than sequential awaits.
  const limit = pLimit(GET_COMMIT_CONCURRENCY)
  const commitsWithFiles = await Promise.all(
    commits.map((entry) =>
      limit(async (): Promise<CommitWithFiles> => {
        const { data: detail } = await client.rest.repos.getCommit({ ...repo, ref: entry.sha })
        return {
          sha: entry.sha,
          message: entry.commit.message,
          files: (detail.files ?? []).map((f) => f.filename),
        }
      })
    )
  )

  return aggregateBumps({ commits: commitsWithFiles, packagePaths, prTitle })
}

type AggregateBumpsParams = {
  commits: CommitWithFiles[]
  packagePaths: Record<string, string>
  prTitle: string
}

/**
 * Pure aggregation: turn `{ commits, packagePaths, prTitle }` into a
 * `{ pkg: bump }` map. Extracted from {@link computeBumpsForPr} so it can
 * be unit-tested without mocking GitHub.
 */
export function aggregateBumps({
  commits,
  packagePaths,
  prTitle,
}: AggregateBumpsParams): Record<string, Bump> {
  const bumps: Record<string, Bump> = {}
  const touchedAcrossPr = new Set<string>()

  for (const commit of commits) {
    const bump = bumpFromMessage(commit.message)
    const packages = filesToPackages(commit.files, packagePaths)
    for (const name of packages) touchedAcrossPr.add(name)

    if (bump === BUMP_NONE) {
      core.info(`skip ${commit.sha.slice(0, 7)}: ${firstLine(commit.message)} (no bump)`)
      continue
    }

    if (packages.size === 0) {
      core.info(
        `skip ${commit.sha.slice(0, 7)}: ${firstLine(commit.message)} (${bump}, no workspace files)`
      )
      continue
    }

    for (const name of packages) {
      bumps[name] = maxBump(bumps[name] ?? BUMP_NONE, bump)
    }

    core.info(
      `commit ${commit.sha.slice(0, 7)} (${bump}): ${[...packages].join(', ')} — ${firstLine(commit.message)}`
    )
  }

  for (const name of Object.keys(bumps)) {
    if (bumps[name] === BUMP_NONE) delete bumps[name]
  }

  if (Object.keys(bumps).length > 0) return bumps

  const titleBump = bumpFromMessage(prTitle)
  if (titleBump !== BUMP_NONE && touchedAcrossPr.size > 0) {
    core.info(
      `no per-commit bump found; falling back to PR title "${prTitle}" → ${titleBump} for [${[...touchedAcrossPr].join(', ')}]`
    )
    for (const name of touchedAcrossPr) bumps[name] = titleBump
    return bumps
  }

  return bumps
}

function firstLine(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? ''
}
