import * as core from '@actions/core'
import { GithubClient } from '../utils/github'
import { Repo } from '../utils/types'

/**
 * Whether `name` has ever been released, determined by the existence of a
 * lerna-style git tag `<name>@<version>` in the repo.
 *
 * Tags are queried via the GitHub API (`git/matching-refs`) rather than
 * local git: the version-dispatch checkout is shallow and does not fetch
 * tags, so `git tag -l` would come back empty. Tags are the release flow's
 * own source of truth — both `version` and `publish` create
 * `<pkg>@<version>` tags — so a package with no matching tag has never been
 * released, regardless of which (public or private) registry it targets.
 *
 * Any API failure is treated as released (`true`) so a transient error
 * never suspends auto-release for a package that really has been released.
 */
export async function isPackageReleased({
  client,
  repo,
  name,
}: {
  client: GithubClient
  repo: Repo
  name: string
}): Promise<boolean> {
  try {
    const { data } = await client.rest.git.listMatchingRefs({
      ...repo,
      ref: `tags/${name}@`,
      per_page: 1,
    })
    return data.length > 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    core.warning(`Could not list tags for "${name}"; assuming it has been released. ${message}`)
    return true
  }
}
