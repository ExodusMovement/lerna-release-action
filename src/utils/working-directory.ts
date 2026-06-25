import { relative } from 'node:path'
import * as core from '@actions/core'
import { spawnSync } from './process'

export type Workspace = {
  // Absolute path of the git repository root.
  repoRoot: string
  // The working directory's path relative to the repo root, '' when the
  // working directory IS the repo root. Bridges repo-root-relative paths
  // (git diff output, GitHub API file lists) and the cwd-relative paths
  // produced by lerna/lerna-utils/fs once the working directory is moved
  // into a subdirectory.
  repoRelativePrefix: string
}

/**
 * Move into the consumer-supplied working directory and report where the
 * resulting cwd sits inside the git repository.
 *
 * When `workingDirectory` is empty the cwd is left untouched and reported as
 * the repo root with an empty prefix, so every caller keeps its previous
 * behavior byte-for-byte. The prefix is derived from `git rev-parse
 * --show-toplevel` rather than assumed, so it is correct whether the
 * directory is the repo root itself (a nested checkout) or a subdirectory of
 * a larger repo.
 */
export function applyWorkingDirectory(workingDirectory: string): Workspace {
  if (!workingDirectory) {
    return { repoRoot: process.cwd(), repoRelativePrefix: '' }
  }

  core.info(`Changing working directory to ${workingDirectory}`)
  process.chdir(workingDirectory)

  const repoRoot = spawnSync('git', ['rev-parse', '--show-toplevel']).trim()
  return { repoRoot, repoRelativePrefix: relative(repoRoot, process.cwd()) }
}

/**
 * Translate repo-root-relative paths (as returned by the GitHub API) into
 * paths relative to the current working directory, dropping any that fall
 * outside it. With an empty prefix the paths are returned unchanged.
 */
export function toWorkspaceRelativePaths(paths: string[], repoRelativePrefix: string): string[] {
  if (!repoRelativePrefix) return paths

  const prefix = repoRelativePrefix.endsWith('/') ? repoRelativePrefix : `${repoRelativePrefix}/`
  return paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
}
