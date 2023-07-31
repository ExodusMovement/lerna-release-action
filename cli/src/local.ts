import { assertCleanCWD, getUsername, pullTags } from './utils/git'
import { getRepo, getToken, setGithubContext } from './utils/gh'
import versionAction from './action/version'
import logger from './utils/logger'

type VersionParams = {
  packagesCsv?: string
  versionStrategy: string
}

export async function version({ packagesCsv, versionStrategy }: VersionParams) {
  assertCleanCWD()
  pullTags()

  const { owner, name } = getRepo()
  setGithubContext({ owner, repo: name })

  const pullRequest = await versionAction({
    token: getToken(),
    versionStrategy,
    packagesCsv,
    autoMerge: true,
    assignee: getUsername(),
    requestReviewers: false,
  })

  logger.info(`Pull request opened at ${pullRequest.html_url}`)
}
