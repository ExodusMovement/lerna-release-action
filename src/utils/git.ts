import { spawnSync } from './process'
import { flagsAsArguments } from './objects'
import * as assert from 'node:assert'
import * as core from '@actions/core'
import { GithubClient } from './github'

const PATH_CHARACTERS = /^[\w./-]+$/

export function add(pathSpecs: string[]) {
  assert(
    pathSpecs.every((it) => !it.startsWith('-') && PATH_CHARACTERS.test(it)),
    'Options are not allowed. Please supply paths to the files you want to add only.'
  )

  spawnSync('git', ['add', ...pathSpecs])
}

type CommitFlags = {
  all?: boolean
  amend?: boolean
  noEdit?: boolean
}

type CommitParams = {
  message?: string
  body?: string
  flags?: CommitFlags
}

const commitFlags = ['amend', 'all', 'noEdit']

export function commit({ message, body, flags }: CommitParams) {
  const args = ['commit', ...flagsAsArguments(flags, commitFlags)]

  if (message) {
    args.push('-m', `"${message}"`)
  }

  if (body) {
    args.push('-m', `"${body}"`)
  }

  spawnSync('git', args)
}

export function switchToBranch(branch: string) {
  spawnSync('git', ['switch', '--create', branch])
}

export function getTags(commit: string): string[] {
  const tags = spawnSync('git', ['tag', '--contains', commit])
  return tags.trim().split('\n')
}

export function deleteTags(tags: string[]) {
  tags.forEach((tag) => spawnSync('git', ['tag', '-d', tag]))
}

export function getCommitSha(): string {
  const stdout = spawnSync('git', ['rev-parse', 'HEAD'])
  return stdout.toString().replaceAll('\n', '').trim()
}

export function getCommitMessage(commit: string): string {
  const stdout = spawnSync('git', ['show', '-s', '--format=%s', commit])
  return stdout.trim()
}

export function getStatusShort(): string {
  return spawnSync('git', ['status', '--short']).trim()
}

export function checkout(ref: string): void {
  spawnSync('git', ['checkout', ref])
}

export function cleanup(): void {
  try {
    spawnSync('git', ['stash', '-u'])
    spawnSync('git', ['stash', 'drop'])
  } catch {}
}

type ResetFlags = {
  mixed?: boolean
}

type ResetCommitsParams = {
  flags: ResetFlags
  count?: number
}

const resetFlags = ['mixed']

export function resetCommits({ flags, count = 1 }: ResetCommitsParams) {
  spawnSync('git', ['reset', ...flagsAsArguments(flags, resetFlags), `HEAD~${count}`])
}

type ConfigureUserParams = {
  name: string
  email: string
}

export function configureUser({ name, email }: ConfigureUserParams) {
  spawnSync('git', ['config', 'user.name', name])
  spawnSync('git', ['config', 'user.email', email])
}

// Lists files added or modified between two commits. Deletions are excluded
// (`--diff-filter=d`) since the release flow only ever creates or updates files.
export function getChangedFiles(base: string, head: string): string[] {
  const stdout = spawnSync('git', ['diff', '--name-only', '-z', '--diff-filter=d', base, head])

  // `-z` yields NUL-separated, verbatim pathnames.
  return stdout.split('\0').filter((path) => path !== '')
}

type CheckoutPrParams = {
  client: GithubClient
  pr: {
    number: number
    head: {
      sha: string
    }
  }
}

export async function checkoutPr({ pr }: CheckoutPrParams) {
  core.info(`Pulling +refs/pull/${pr.number}/head:refs/remotes/origin/pr/${pr.number}`)
  // Fetch PR head ref which is available even if the branch was deleted
  const stdout = spawnSync('git', [
    'fetch',
    'origin',
    `+refs/pull/${pr.number}/head:refs/remotes/origin/pr/${pr.number}`,
  ])

  core.debug(stdout)

  const branchName = `pr-${pr.number}`
  spawnSync('git', ['checkout', '-B', branchName, pr.head.sha])
  core.info(`HEAD is ${getCommitSha()}`)
}
