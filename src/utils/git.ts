import { spawnSync } from './process'
import { flagsAsArguments } from './objects'

export function add(pathSpecs: string[]) {
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
export function commit({ message, body, flags }: CommitParams) {
  const args = ['commit', ...flagsAsArguments(flags)]

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

export async function getBranch(): Promise<string> {
  const stdout = spawnSync('git', ['branch', '--show-current'])
  return stdout.toString().replaceAll('\n', '').trim()
}

export async function getRef(): Promise<string> {
  const branch = await getBranch()
  if (branch) return branch

  return getCommitSha() // in case of detached head
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

export function resetLastCommit({ flags }: ResetLastCommitParams) {
  spawnSync('git', ['reset', ...flagsAsArguments(flags), 'HEAD~1'])
}

type ConfigureUserParams = {
  name: string
  email: string
}
export function configureUser({ name, email }: ConfigureUserParams) {
  spawnSync('git', ['config', 'user.name', name])
  spawnSync('git', ['config', 'user.email', email])
}
