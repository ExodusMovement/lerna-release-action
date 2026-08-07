import * as core from '@actions/core'
import * as github from '@actions/github'
import pLimit = require('p-limit')

export type CommitWithFiles = {
  sha: string
  message: string
  files: string[]
}

// Cap concurrency to avoid GitHub's secondary rate limit on PRs with many
// commits. 10 is well under the per-second ceiling while still ~10x faster
// than sequential awaits.
const GET_COMMIT_CONCURRENCY = 10

/**
 * Fetch a PR's individual (pre-squash) commits together with the files each
 * touched. Used both to attribute per-package bumps (version-dispatch) and to
 * attribute per-package changelog entries (version/update-changelog), so the
 * two always agree on which commit affected which package.
 *
 * The commit list is paginated; each commit's file list is fetched in parallel
 * under a concurrency cap.
 */
export async function fetchPrCommitsWithFiles({
  client,
  repo,
  prNumber,
}: {
  client: ReturnType<typeof github.getOctokit>
  repo: { owner: string; repo: string }
  prNumber: number
}): Promise<CommitWithFiles[]> {
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

  const limit = pLimit(GET_COMMIT_CONCURRENCY)
  return Promise.all(
    commits.map((entry) =>
      limit(async (): Promise<CommitWithFiles> => {
        const { data: detail } = await client.rest.repos.getCommit({ ...repo, ref: entry.sha })
        return {
          sha: entry.sha,
          message: entry.commit.message,
          files: (detail.files ?? []).map((f) => f.filename),
        }
      })
    )
  )
}
