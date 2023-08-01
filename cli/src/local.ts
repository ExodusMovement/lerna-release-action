import { assertCleanCWD, getUsername, pullTags } from './utils/git'
import { getRepo, getToken, setGithubContext } from './utils/gh'
import versionAction from './action/version'
import logger from './utils/logger'
import { program } from 'commander'
import { ProgramOpts } from './utils/types'
import * as assert from 'assert'

type VersionParams = {
  packagesCsv?: string
  versionStrategy: string
}

export async function version({ packagesCsv, versionStrategy }: VersionParams) {
  assertCleanCWD()
  pullTags()

  const { owner, name } = getRepo()
  setGithubContext({ owner, repo: name })

  const { githubToken } = program.opts<ProgramOpts>()
  const token = githubToken ?? getToken()

  assert(
    token,
    'No token found in ~/.config/gh/hosts.yml. Use "gh auth login --insecure-storage" or provide a token via --github-token to this program'
  )

  const pullRequest = await versionAction({
    token,
    versionStrategy,
    packagesCsv,
    autoMerge: true,
    assignee: getUsername(),
    requestReviewers: false,
  })

  logger.info(`Pull request opened at ${pullRequest.html_url}`)
}
