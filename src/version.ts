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
  pushHeadToOrigin,
  resetLastCommit,
  switchToBranch,
} from './utils/git'
import readPackageJsons from './version/read-package-jsons'
import getTags from './version/get-tags'
import * as crypto from 'crypto'
import revertUnwantedDependencyChanges from './version/revert-unwanted-dependency-changes'
import versionPackages from './version/version-packages'
import { updateLockfile } from './utils/package-manager'
import createPullRequest from './version/create-pull-request'
import {
  assertStrategy,
  isPreReleaseStrategy,
  validateAllowedStrategies,
  VersionStrategy,
} from './version/strategy'
import updateChangelog from './version/update-changelog'
import closePreviousPrs from './version/close-previous-prs'
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
  autoMerge = core.getBooleanInput(Input.AutoMerge),
  draft = core.getBooleanInput(Input.Draft),
  requestReviewers = core.getBooleanInput(Input.RequestReviewers),
  assignee = core.getInput(Input.Assignee),
  committer = core.getInput(Input.Committer),
  baseBranch = core.getInput(Input.BaseBranch),
} = {}) {
  assertStrategy(versionStrategy)
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

  await validateAllowedStrategies({ packages, versionStrategy })

  const client = github.getOctokit(token)
  const defaultBranch = await getDefaultBranch({ client, repo })

  if (baseBranch && baseBranch !== defaultBranch && !isPreReleaseStrategy(versionStrategy)) {
    core.setFailed('Can only pre-release from branches that are not the repository default branch')
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

  core.info('Versioning packages')
  versionPackages({ extraArgs: versionExtraArgs, versionStrategy })

  const tags = getTags(packages)
  core.debug(`Tags found: ${tags}`)

  const branch = `ci/release/${crypto.randomUUID()}`
  const sha = getCommitSha()
  const message = getCommitMessage(sha)

  core.debug(`Switching to branch ${branch}`)
  switchToBranch(branch)

  core.info('Resetting commit created by lerna to stage only selected packages')
  resetLastCommit({ flags: { mixed: true } })
  add(packages)
  commit({ message, body: tags.join('\n') })

  core.info('Deleting previous tags and cleaning up working directory')
  deleteTags(tags)
  cleanup()

  if (versionStrategy !== VersionStrategy.ConventionalCommits) {
    core.info(`Static version strategy used. Trying to generate changelogs manually.`)
    await Promise.all(packages.map((packageDir) => updateChangelog(packageDir)))
    add(packages)
    commit({ message: 'chore: update changelogs' })
  }

  core.info('Reverting changes to dependencies bumped but not included in release')
  await revertUnwantedDependencyChanges({ packages, previousPackageContents })
  updateLockfile()
  commit({ flags: { all: true, amend: true, noEdit: true } })

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
