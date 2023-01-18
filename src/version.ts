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
import { assertStrategy, validateAllowedStrategies } from './version/strategy'

async function version() {
  const packagesCsv = core.getInput(Input.Packages, { required: true })
  const token = core.getInput(Input.GithubToken, { required: true })
  const versionExtraArgs = core.getInput(Input.VersionExtraArgs)
  const versionStrategy = core.getInput(Input.VersionStrategy)

  assertStrategy(versionStrategy)

  const packages = await normalizePackages({ packagesCsv })
  await validateAllowedStrategies({ packages, versionStrategy })

  const client = github.getOctokit(token)

  const { actor, repo } = github.context

  core.info(`Configure user ${actor}`)
  await configureUser({
    name: actor,
    email: `${actor}@users.noreply.github.com`,
  })

  core.info('Creating object of previous package.json contents')
  const previousPackageContents = await readPackageJsons()

  core.info('Versioning packages')
  await versionPackages({ extraArgs: versionExtraArgs, versionStrategy })

  const tags = await getTags(packages)
  core.debug(`Tags found: ${tags}`)

  const branch = `ci/release/${crypto.randomUUID()}`
  const sha = await getCommitSha()
  const message = await getCommitMessage(sha)

  core.debug(`Switching to branch ${branch}`)
  await switchToBranch(branch)

  core.info('Resetting commit created by lerna to stage only selected packages')
  await resetLastCommit({ flags: { mixed: true } })
  await add(packages.join(' '))
  await commit({ message, body: tags.join('\n') })

  core.info('Deleting previous tags and cleaning up working directory')
  await deleteTags(tags)
  await cleanup()

  core.info('Reverting changes to dependencies bumped but not included in release')
  await revertUnwantedDependencyChanges({ packages, previousPackageContents })
  await updateLockfile()
  await commit({ flags: { all: true, amend: true, noEdit: true } })

  core.info(`Pushing changes to ${branch}`)
  await pushHeadToOrigin()

  core.info('Creating PR')
  await createPullRequest({
    client,
    repo,
    packages,
    tags,
    branch,
    labels: [RELEASE_PR_LABEL],
    assignees: [actor],
  })
}

version().catch((error: Error) => {
  if (error.stack) {
    core.debug(error.stack)
  }
  core.setFailed(String(error.message))
})
