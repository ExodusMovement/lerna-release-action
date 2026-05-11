import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import { getPathsByPackageNames } from '@exodus/lerna-utils'
import { Filesystem } from './utils/types'
import { Bump, BUMP_NONE, bumpFromMessage, maxBump } from './commit-driven-version-dispatch/bumps'
import { filesToPackages } from './commit-driven-version-dispatch/files-to-packages'

export enum CommitDrivenVersionDispatchInput {
  GithubToken = 'github-token',
  VersionWorkflowId = 'version-workflow-id',
  Ref = 'ref',
  ExcludeLabels = 'exclude-labels',
  DryRun = 'dry-run',
  PrNumber = 'pr-number',
}

type Params = {
  filesystem?: Filesystem
}

if (require.main === module) {
  commitDrivenVersionDispatch().catch((error: Error) => {
    if (error.stack) core.debug(error.stack)
    core.setFailed(String(error.message))
  })
}

/**
 * Inspect a merged PR's pre-squash commits, attribute each commit to
 * workspace packages by the files it touched, derive a per-package bump
 * level from each commit's conventional-commit subject (max-bump wins per
 * package), and dispatch the version workflow with a `{ pkg: bump }`
 * JSON map.
 *
 * If no commit carries a release-worthy type, the action falls back to
 * parsing the PR title once and applying that bump to every workspace
 * touched anywhere in the PR. Preserves the long-standing
 * "PR title is the release-level" workflow for PRs whose individual
 * commits do not carry conventional subjects.
 *
 * The dispatched workflow is expected to forward `packages` and `bumps`
 * to `lerna-release-action/version`, which then runs `npm version <bump>`
 * once per `(pkg, bump)` entry — see `versionPackagesExplicit` in
 * `src/version/version-packages.ts`.
 */
async function commitDrivenVersionDispatch({ filesystem = fs }: Params = {}): Promise<Record<
  string,
  Bump
> | null> {
  const token = core.getInput(CommitDrivenVersionDispatchInput.GithubToken, { required: true })
  const versionWorkflowId =
    core.getInput(CommitDrivenVersionDispatchInput.VersionWorkflowId) || 'version.yml'
  const ref = core.getInput(CommitDrivenVersionDispatchInput.Ref) || 'master'
  const excludeLabels = normalizeExcludeLabels(
    core.getInput(CommitDrivenVersionDispatchInput.ExcludeLabels) || 'skip-release'
  )
  const dryRun = core.getInput(CommitDrivenVersionDispatchInput.DryRun) === 'true'
  const prNumberInput = core.getInput(CommitDrivenVersionDispatchInput.PrNumber)

  const { repo, payload } = github.context
  const client = github.getOctokit(token)

  let pr: PullRequest | null = null
  if (prNumberInput) {
    const { data } = await client.rest.pulls.get({ ...repo, pull_number: Number(prNumberInput) })
    pr = data as PullRequest
  } else if (payload.pull_request) {
    pr = payload.pull_request as PullRequest
    if (!pr.merged) {
      core.notice('PR was closed without merging.')
      return null
    }
  } else {
    core.warning('Action triggered by non-PR event and no `pr-number` was supplied.')
    return null
  }

  if ((pr.labels ?? []).some((label) => excludeLabels.includes(label.name))) {
    core.notice('Skipped: PR carries an exclude-label.')
    return null
  }

  const packagePaths = await getPathsByPackageNames({ filesystem })
  if (Object.keys(packagePaths).length === 0) {
    core.warning('No workspace packages discovered. Aborting.')
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
  if (packageNames.length === 0) {
    core.notice('No releaseable commits across workspace packages.')
    return null
  }

  core.setOutput('packages', packageNames.join(','))
  core.setOutput('bumps', JSON.stringify(bumps))

  if (dryRun) {
    core.info(`dry-run: bumps = ${JSON.stringify(bumps, null, 2)}`)
    return bumps
  }

  try {
    await client.rest.actions.createWorkflowDispatch({
      ref,
      ...repo,
      workflow_id: versionWorkflowId,
      inputs: {
        assignee: pr.user?.login ?? '',
        packages: packageNames.join(','),
        bumps: JSON.stringify(bumps),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    core.setFailed(`Failed to dispatch ${versionWorkflowId}: ${message}`)
    return bumps
  }

  core.info(`Dispatched ${versionWorkflowId} with bumps ${JSON.stringify(bumps)}`)
  return bumps
}

type PullRequest = {
  number: number
  title: string
  merged?: boolean
  labels?: { name: string }[]
  user?: { login: string }
}

function normalizeExcludeLabels(input: string | string[] | undefined): string[] {
  if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter(Boolean)
  if (typeof input !== 'string') return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

type ComputeBumpsParams = {
  client: ReturnType<typeof github.getOctokit>
  repo: { owner: string; repo: string }
  prNumber: number
  packagePaths: Record<string, string>
  prTitle: string
}

/**
 * Walk a PR's individual commits and build a `{ pkg: bump }` map.
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

  const bumps: Record<string, Bump> = {}
  const touchedAcrossPr = new Set<string>()

  for (const entry of commits) {
    const sha = entry.sha
    const message = entry.commit.message
    const bump = bumpFromMessage(message)
    const { data: detail } = await client.rest.repos.getCommit({ ...repo, ref: sha })
    const files = (detail.files ?? []).map((f) => f.filename)
    const packages = filesToPackages(files, packagePaths)
    for (const name of packages) touchedAcrossPr.add(name)

    if (bump === BUMP_NONE) {
      core.info(`skip ${sha.slice(0, 7)}: ${firstLine(message)} (no bump)`)
      continue
    }

    if (packages.size === 0) {
      core.info(`skip ${sha.slice(0, 7)}: ${firstLine(message)} (${bump}, no workspace files)`)
      continue
    }

    for (const name of packages) {
      bumps[name] = maxBump(bumps[name] ?? BUMP_NONE, bump)
    }

    core.info(
      `commit ${sha.slice(0, 7)} (${bump}): ${[...packages].join(', ')} — ${firstLine(message)}`
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

export { normalizeExcludeLabels }
export default commitDrivenVersionDispatch
