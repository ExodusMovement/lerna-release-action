import { exec } from './process'
import { stringifyFlags } from './objects'

export async function add(pathSpec: string): Promise<void> {
  await exec(`git add ${pathSpec}`)
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
export async function commit({ message, body, flags }: CommitParams): Promise<void> {
  let command = `git commit ${stringifyFlags(flags)}`
  if (message) {
    command += ` -m "${message}"`
  }

  if (body) {
    command += ` -m "${body}"`
  }

  await exec(command)
}

export async function pushHeadToOrigin() {
  await exec('git push origin HEAD')
}

export async function switchToBranch(branch: string): Promise<void> {
  await exec(`git switch --create ${branch}`)
}

export async function getBranch(): Promise<string> {
  const { stdout } = await exec(`git branch --show-current`)
  return stdout.toString().replaceAll('\n', '').trim()
}

export async function getRef(): Promise<string> {
  const branch = await getBranch()
  if (branch) return branch

  return getCommitSha() // in case of detached head
}

export async function getTags(commit: string): Promise<string[]> {
  const { stdout: tags } = await exec(`git tag --contains ${commit}`)
  return tags.trim().split('\n')
}

export async function deleteTags(tags: string[]): Promise<void> {
  await Promise.all(tags.map((tag) => exec(`git tag -d ${tag}`)))
}

export async function getCommitSha(): Promise<string> {
  const { stdout } = await exec(`git rev-parse HEAD`)
  return stdout.toString().replaceAll('\n', '').trim()
}

export async function getCommitMessage(commit: string): Promise<string> {
  const { stdout } = await exec(`git show -s --format=%s "${commit}"`)
  return stdout.trim()
}

export async function checkout(ref: string): Promise<void> {
  await exec(`git checkout ${ref}`)
}

export async function cleanup(): Promise<void> {
  await exec(`git stash -u && git stash drop`).catch(() => true)
}

type ResetFlags = {
  mixed?: boolean
}

type ResetLastCommitParams = {
  flags: ResetFlags
}

export async function resetLastCommit({ flags }: ResetLastCommitParams) {
  await exec(`git reset ${stringifyFlags(flags)} HEAD~1`)
}

type ConfigureUserParams = {
  name: string
  email: string
}
export async function configureUser({ name, email }: ConfigureUserParams) {
  await exec(`git config user.name ${name}`)
  await exec(`git config user.email ${email}`)
}
