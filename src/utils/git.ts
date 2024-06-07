import { spawnSync } from './process'
import { flagsAsArguments } from './objects'
import * as assert from 'node:assert'

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

export function pushHeadToOrigin() {
  spawnSync('git', ['push', 'origin', 'HEAD'])
}

export function switchToBranch(branch: string) {
  spawnSync('git', ['switch', '--create', branch])
}

export function getBranch(): string {
  const stdout = spawnSync('git', ['branch', '--show-current'])
  return stdout.toString().replaceAll('\n', '').trim()
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

type ResetLastCommitParams = {
  flags: ResetFlags
}

const resetFlags = ['mixed']

export function resetLastCommit({ flags }: ResetLastCommitParams) {
  spawnSync('git', ['reset', ...flagsAsArguments(flags, resetFlags), 'HEAD~1'])
}

type ConfigureUserParams = {
  name: string
  email: string
}
export function configureUser({ name, email }: ConfigureUserParams) {
  spawnSync('git', ['config', 'user.name', name])
  spawnSync('git', ['config', 'user.email', email])
}
