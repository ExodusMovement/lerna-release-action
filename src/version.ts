import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import { Input, RELEASE_PR_LABEL } from './constants'
import normalizePackages from './version/normalize-packages'
import {
  add,
  cleanup,
  commit,
  configureUser,
  deleteTags,
  getChangedFiles,
  getCommitMessage,
  getCommitSha,
  getStatusShort,
  resetCommits,
  switchToBranch,
} from './utils/git'
import readPackageJsons from './version/read-package-jsons'
import getTags from './version/get-tags'
import * as crypto from 'crypto'
import revertUnwantedDependencyChanges from './version/revert-unwanted-dependency-changes'
import versionPackages, { versionPackagesExplicit } from './version/version-packages'
import { parseBumps } from './version/parse-bumps'
import { updateLockfile } from './utils/package-manager'
import createPullRequest from './version/create-pull-request'
import {
  assertStrategy,
  canUseFromNonDefaultBranch,
  validateAllowedStrategies,
  VersionStrategy,
} from './version/strategy'
import updateChangelog, { ChangelogAttribution } from './version/update-changelog'
import closePreviousPrs from './version/close-previous-prs'
import { formatPackageFiles } from './utils/format'
import { unwrapErrorMessage } from './utils/errors'
import * as assert from 'assert'
import { createSignedCommit, getDefaultBranch } from './utils/github'
import { applyWorkingDirectory } from './utils/working-directory'
import { getPathsByPackageNames } from '@exodus/lerna-utils'
import { CommitWithFiles, fetchPrCommitsWithFiles } from './utils/pr-commits'

if (require.main === module) {
  version().catch((error: Error) => {
    if (error.stack) {
      core.debug(error.stack)
    }

    core.setFailed(String(error.message))
  })
}

export default async function version({
  packagesCsv = core.getInput(Input.Packages, { required: true }),
  token = core.getInput(Input.GithubToken, { required: true }),
  workingDirectory = core.getInput(Input.Path),
  versionExtraArgs = core.getInput(Input.VersionExtraArgs),
  versionStrategy = core.getInput(Input.VersionStrategy),
  bumpsRaw = core.getInput(Input.Bumps),
  autoMerge = core.getBooleanInput(Input.AutoMerge),
  draft = core.getBooleanInput(Input.Draft),
  requestReviewers = core.getBooleanInput(Input.RequestReviewers),
  assignee = core.getInput(Input.Assignee),
  baseBranch = core.getInput(Input.BaseBranch),
  formatCommand = core.getInput(Input.FormatCommand),
} = {}) {
  const { repoRoot, repoRelativePrefix } = applyWorkingDirectory(workingDirectory)

  const bumps = parseBumps(bumpsRaw)
  let narrowedStrategy: VersionStrategy | null = null
  if (!bumps) {
    assertStrategy(versionStrategy)
    narrowedStrategy = versionStrategy
  }

  assert(
    !(draft && autoMerge),
    'A pull-request can either be created as draft, or with auto-merge enabled, but not both at the same time.'
  )

  const { actor, repo } = github.context
  assignee = assignee || actor

  const packages = await normalizePackages({ packagesCsv })

  if (packages.length === 0) {
    core.warning('Nothing to version. Note that private versions are filtered')
    return
  }

  if (narrowedStrategy) {
    await validateAllowedStrategies({ packages, versionStrategy: narrowedStrategy })
  }

  const client = github.getOctokit(token)
  const defaultBranch = await getDefaultBranch({ client, repo })

  if (
    narrowedStrategy &&
    baseBranch &&
    baseBranch !== defaultBranch &&
    !canUseFromNonDefaultBranch(narrowedStrategy)
  ) {
    core.setFailed(`Version strategy ${narrowedStrategy} cannot be used from a non-default branch`)
    return
  }

  const base = baseBranch || defaultBranch

  // lerna requires a git identity to make its (throwaway) local commits. The
  // identity is intentionally a fake placeholder since those commits are never
  // pushed — the real release commit is signed by GitHub via createSignedCommit.
  configureUser({
    name: 'lerna-release-action (throwaway, not pushed)',
    email: 'noreply@invalid.local',
  })

  core.info('Creating object of previous package.json contents')
  const previousPackageContents = await readPackageJsons()

  // Anchor for tag discovery — captured *before* lerna runs so that the
  // explicit-bumps path (which produces N commits between this sha and
  // HEAD) recovers per-package tags from every iteration, not just the last.
  const preLernaSha = getCommitSha()

  core.info('Versioning packages')
  let commitsToReset = 1
  if (bumps) {
    commitsToReset = await versionPackagesExplicit({ bumps, packages })
  } else if (narrowedStrategy) {
    versionPackages({ extraArgs: versionExtraArgs, versionStrategy: narrowedStrategy })
  }

  const tags = getTags(packages, preLernaSha)
  core.debug(`Tags found: ${tags}`)

  const branch = `ci/release/${crypto.randomUUID()}`
  const sha = getCommitSha()
  // For explicit bumps, the last lerna call's commit message describes only
  // the last package — borrowing it as the squashed combined-commit subject
  // would be misleading for a multi-package release. Synthesize a subject
  // that names every released package instead.
  const message = bumps
    ? `chore(release): publish ${Object.keys(bumps).join(', ')}`
    : getCommitMessage(sha)

  core.debug(`Switching to branch ${branch}`)
  switchToBranch(branch)

  core.info(
    `Resetting ${commitsToReset} commit${commitsToReset === 1 ? '' : 's'} created by lerna to stage only selected packages`
  )
  resetCommits({ flags: { mixed: true }, count: commitsToReset })
  formatPackageFiles({ formatCommand, packages })
  add(packages)
  commit({ message, body: tags.join('\n') })

  core.info('Deleting previous tags and cleaning up working directory')
  deleteTags(tags)
  cleanup()

  // This action always generates changelogs itself now: the explicit-`bumps`
  // and static paths never had lerna write them, and the conventional-commits
  // path runs lerna with --no-changelog (see versionPackages) for the same
  // reason. A single squash commit can span several packages, so re-attribute
  // each commit to its package by file path instead of letting
  // conventional-changelog copy the whole squash message (breaking-change
  // footers and all) into every touched package's changelog.
  core.info('Generating changelogs')
  const packagePaths = await getPathsByPackageNames({ filesystem: fs })
  const prCommitCache = new Map<number, Promise<CommitWithFiles[]>>()
  const loadPrCommits = (prNumber: number) => {
    let cached = prCommitCache.get(prNumber)
    if (!cached) {
      cached = fetchPrCommitsWithFiles({ client, repo, prNumber })
      prCommitCache.set(prNumber, cached)
    }

    return cached
  }

  const attribution: ChangelogAttribution = { packagePaths, repoRelativePrefix, loadPrCommits }

  await Promise.all(packages.map((packageDir) => updateChangelog(packageDir, attribution)))
  formatPackageFiles({ formatCommand, packages })
  add(packages)
  commit({ message: 'chore: update changelogs' })

  core.info('Reverting changes to dependencies bumped but not included in release')
  await revertUnwantedDependencyChanges({ packages, previousPackageContents })
  core.info(`Git status before lockfile refresh:\n${getStatusShort() || '(clean)'}`)

  try {
    updateLockfile()
  } catch (error) {
    core.error(`Lockfile refresh failed. Git status:\n${getStatusShort() || '(clean)'}`)
    throw error
  }

  formatPackageFiles({ formatCommand, packages })

  core.info(`Git status before amend:\n${getStatusShort() || '(clean)'}`)

  try {
    commit({ flags: { all: true, amend: true, noEdit: true } })
  } catch (error) {
    core.error(`Amend commit failed. Git status:\n${getStatusShort() || '(clean)'}`)
    throw error
  }

  // The local commits above are throwaway and never pushed; they only let us
  // diff the net changed files against the checkout sha. The real release commit
  // is made remotely via createCommitOnBranch so GitHub signs it ("Verified").
  core.info(`Creating signed commit on ${branch}`)
  const additions = getChangedFiles(preLernaSha, getCommitSha())
  await createSignedCommit({
    client,
    repo,
    branch,
    expectedHeadOid: preLernaSha,
    headline: message,
    body: tags.join('\n'),
    additions,
    repoRoot,
  })

  core.info('Creating PR')
  const pullRequest = await createPullRequest({
    client,
    draft,
    base,
    repo,
    packages,
    tags,
    branch,
    labels: [RELEASE_PR_LABEL],
    assignees: [assignee],
    autoMerge,
    requestReviewers,
  })

  try {
    await closePreviousPrs({ client, repo, pullRequest, packages })
  } catch (e) {
    core.warning(`Failed to close previous PRs: ${unwrapErrorMessage(e, 'for unknown reasons')}`)
  }

  return pullRequest
}
