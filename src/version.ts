import * as core from '@actions/core'
import * as github from '@actions/github'
import { Input, RELEASE_PR_LABEL } from './constants'
import normalizePackages from './version/normalize-packages'
import {
  add,
  cleanup,
  commit,
  configureUser,
  deleteTags,
  getCommitMessage,
  getCommitSha,
  getStatusShort,
  pushHeadToOrigin,
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
import updateChangelog from './version/update-changelog'
import closePreviousPrs from './version/close-previous-prs'
import { formatPackageFiles } from './utils/format'
import { unwrapErrorMessage } from './utils/errors'
import * as assert from 'assert'
import { getDefaultBranch } from './utils/github'

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
  versionExtraArgs = core.getInput(Input.VersionExtraArgs),
  versionStrategy = core.getInput(Input.VersionStrategy),
  bumpsRaw = core.getInput(Input.Bumps),
  autoMerge = core.getBooleanInput(Input.AutoMerge),
  draft = core.getBooleanInput(Input.Draft),
  requestReviewers = core.getBooleanInput(Input.RequestReviewers),
  assignee = core.getInput(Input.Assignee),
  committer = core.getInput(Input.Committer),
  baseBranch = core.getInput(Input.BaseBranch),
  formatCommand = core.getInput(Input.FormatCommand),
} = {}) {
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

  committer = committer || assignee
  core.info(`Configure git user as ${committer}`)

  configureUser({
    name: committer,
    email: `${committer}@users.noreply.github.com`,
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
    commitsToReset = versionPackagesExplicit({ bumps, packages })
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

  const usedStaticOrExplicit = bumps
    ? true
    : narrowedStrategy !== VersionStrategy.ConventionalCommits
  if (usedStaticOrExplicit) {
    core.info(`Explicit / static bump used. Trying to generate changelogs manually.`)
    await Promise.all(packages.map((packageDir) => updateChangelog(packageDir)))
    formatPackageFiles({ formatCommand, packages })
    add(packages)
    commit({ message: 'chore: update changelogs' })
  }

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

  core.info(`Pushing changes to ${branch}`)
  pushHeadToOrigin()

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
