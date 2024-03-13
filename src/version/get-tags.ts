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

export default function getTags(packages: string[]) {
  const commit = git.getCommitSha()
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
