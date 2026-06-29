import * as conventionalCommitsParser from 'conventional-commits-parser'
import { filesToPackages } from '../version-dispatch/files-to-packages'
import { toWorkspaceRelativePaths } from '../utils/working-directory'
import { CommitWithFiles } from '../utils/pr-commits'

// The parsed-commit shape conventional-changelog-writer consumes. Only a
// handful of fields are read or rewritten here; the rest pass through.
export type ParsedCommit = {
  hash?: string | null
  committerDate?: unknown
  gitTags?: string
  subject?: string | null
  header?: string | null
  notes?: unknown[]
  references?: unknown[]
  [key: string]: unknown
}

// GitHub's squash-merge convention appends ` (#<pr>)` to the commit subject.
const PR_REF_RE = /\(#(\d+)\)\s*$/

/**
 * Extract the squash-merge PR number from a commit's first line, e.g.
 * `fix(fusion): keychain type (#17399)` → 17399. Returns null when the
 * subject carries no trailing `(#N)` — a non-squash commit, a direct push,
 * or a custom merge — so the caller can fall back to the commit as-is.
 */
export function extractPrNumber(header: unknown): number | null {
  if (typeof header !== 'string') return null
  const firstLine = header.split(/\r?\n/, 1)[0] ?? ''
  const match = PR_REF_RE.exec(firstLine)
  return match ? Number(match[1]) : null
}

/**
 * Format a git committer date (`%ci`/`%cI`) to `yyyy-mm-dd` in UTC, matching
 * conventional-changelog-core's default transform. The release header date is
 * derived from this, so it must not be left as a raw timestamp.
 */
export function formatCommitterDate(value: unknown): string {
  const raw = String(value)
  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  // Both `%ci` ("2026-06-29 17:42:51 +0000") and `%cI` ISO strings start with
  // the calendar date, so a slice is a safe last resort if parsing fails.
  return raw.slice(0, 10)
}

/**
 * Re-attribute a squash commit to a single package.
 *
 * A GitHub squash collapses a PR's commits into one, so conventional-changelog
 * — which keys a commit to a package by the files it touched — would render
 * that single commit's *entire* concatenated message (breaking-change footers
 * and all) into the changelog of every package the PR touched. This rebuilds
 * the per-package view from the PR's pre-squash commits: keep only the
 * sub-commits whose files map to `packageName`, re-parse each one on its own
 * (so unrelated bodies and `Co-Authored-By` trailers never bleed in), and
 * stamp the squash commit's identity so links still resolve to the merged
 * commit and PR.
 *
 * @returns the parsed commits to emit for this package. Empty when no
 *   sub-commit touches it (the writer then renders a bump-only entry).
 */
export function decomposeForPackage({
  squash,
  subCommits,
  packageName,
  packagePaths,
  parserOpts,
  prNumber,
  repoRelativePrefix = '',
}: {
  squash: ParsedCommit
  subCommits: CommitWithFiles[]
  packageName: string
  packagePaths: Record<string, string>
  parserOpts: unknown
  prNumber: number
  repoRelativePrefix?: string
}): ParsedCommit[] {
  const emitted: ParsedCommit[] = []

  for (const sub of subCommits) {
    const files = toWorkspaceRelativePaths(sub.files, repoRelativePrefix)
    if (!filesToPackages(files, packagePaths).has(packageName)) continue

    const parsed = conventionalCommitsParser.sync(sub.message, parserOpts) as ParsedCommit

    // Identity comes from the squash commit that actually landed on the
    // default branch — the pre-squash SHAs are unreachable after merge.
    parsed.hash = squash.hash
    parsed.committerDate = squash.committerDate
    parsed.gitTags = squash.gitTags

    // The writer renders the (#N) link from a trailing reference in the
    // subject (GitHub's squash convention). Pre-squash subjects lack it, so
    // append it unless the author already wrote one.
    if (typeof parsed.subject === 'string' && !PR_REF_RE.test(parsed.subject)) {
      parsed.subject = `${parsed.subject} (#${prNumber})`
    }

    emitted.push(parsed)
  }

  return emitted
}
