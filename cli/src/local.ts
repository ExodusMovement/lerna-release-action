import { ensureCleanCWD, getUsername } from './utils/git'
import { getRepo, getToken, setGithubContext } from './utils/gh'
import versionGithub from '../../src/version'

type VersionParams = {
  packagesCsv?: string
  versionStrategy: string
}

export async function version({ packagesCsv, versionStrategy }: VersionParams) {
  ensureCleanCWD()

  const { owner, name } = getRepo()
  setGithubContext({ owner, repo: name })
  await versionGithub({
    token: getToken(),
    versionStrategy,
    packagesCsv,
    autoMerge: true,
    assignee: getUsername(),
  })
  process.exit(0)
}
