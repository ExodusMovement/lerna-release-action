import * as core from '@actions/core'
import * as github from '@actions/github'
import { Input } from './constants'
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
import backupPackages from './version/backup-packages'
import getTags from './version/get-tags'
import * as crypto from 'crypto'
import revertUnwantedDependencyChanges from './version/revert-unwanted-dependency-changes'
import versionPackages from './version/version-packages'
import { updateLockfile } from './utils/package-manager'
import createPullRequest from './version/create-pull-request'

async function version() {
  const packagesCsv = core.getInput(Input.Packages, { required: true })
  const token = core.getInput(Input.GithubToken, { required: true })
  const versionExtraArgs = core.getInput(Input.VersionExtraArgs)

  const packages = await normalizePackages({ packagesCsv })

  const client = github.getOctokit(token)

  const { actor, repo } = github.context

  core.info(`Configure user ${actor}`)
  await configureUser({
    name: actor,
    email: `${actor}@users.noreply.github.com`,
  })

  core.info('Backing up packages')
  await backupPackages()

  core.info('Versioning packages')
  await versionPackages({ extraArgs: versionExtraArgs })

  const tags = await getTags(packages)
  core.debug(`Tags found: ${tags}`)

  const branch = `ci/release/${crypto.randomUUID()}`
  const sha = await getCommitSha()
  const message = await getCommitMessage(sha)

  core.debug(`Switching to branch ${branch}`)
  await switchToBranch(branch)

  core.info('Resetting last commit to stage only selected packages')
  await resetLastCommit({ flags: { mixed: true } })
  await add(packages.join(' '))
  await commit({ message, body: tags.join('\n') })

  core.info('Deleting previous tags and cleaning up working directory')
  await deleteTags(tags)
  await cleanup()

  core.info('Reverting changes to dependencies bumped but not included in release')
  await revertUnwantedDependencyChanges({ packages })
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
    labels: ['publish-on-merge'],
    assignees: [actor],
  })
}

version().catch((error) => {
  core.error(String(error))
  core.setFailed(String(error.message))
})
