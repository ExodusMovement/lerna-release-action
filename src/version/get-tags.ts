import * as path from 'path'
import * as git from '../utils/git'
import * as assert from 'node:assert'

const ALLOWED_CHARACTERS = /^[\w/@-]+$/
const MAX_TAG_LENGTH = 230

export function matches(tag: string, packageName: string): boolean {
  assert(
    ALLOWED_CHARACTERS.test(packageName),
    'Regex control characters not allowed in package name'
  )
  assert(
    tag.length <= MAX_TAG_LENGTH,
    `Received abnormally long tag of ${tag.length} characters. Max ${MAX_TAG_LENGTH} characters allowed`
  )

  return new RegExp(`@[^/]+/${packageName}@`).test(tag)
}

/**
 * Collects the tags that lerna created during the version step.
 *
 * `fromSha` anchors the scan: `git tag --contains <fromSha>` returns every
 * tag whose commit is `fromSha` itself or a descendant. The version flow
 * captures `fromSha` *before* the lerna call(s) so the explicit-bumps path,
 * which produces N commits between `fromSha` and HEAD, recovers per-package
 * tags from every iteration. The single-call path (one commit at HEAD) is a
 * special case of the same logic.
 *
 * Falls back to HEAD when `fromSha` is omitted to preserve the previous
 * signature for callers that haven't been updated yet — only correct when
 * lerna created exactly one commit.
 *
 * @param packages — repo-relative package paths to filter tags down to.
 * @param fromSha — commit sha taken just before lerna ran. Defaults to HEAD.
 */
export default function getTags(packages: string[], fromSha?: string) {
  const commit = fromSha ?? git.getCommitSha()
  const names = packages.map((it) => path.basename(it))

  const tags = git.getTags(commit)

  return tags
    .filter((tag) => names.some((name) => matches(tag, name)))
    .sort((a, b) => {
      const indexA = names.findIndex((name) => matches(a, name))
      const indexB = names.findIndex((name) => matches(b, name))

      if (indexA > indexB) return 1
      if (indexA < indexB) return -1
      return 0
    })
}
