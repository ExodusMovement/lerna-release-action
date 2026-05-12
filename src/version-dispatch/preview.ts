import * as path from 'path'
import * as core from '@actions/core'
import { Bump, BUMP_MAJOR, BUMP_MINOR, BUMP_PATCH } from './bumps'
import { Filesystem, Repo } from '../utils/types'
import { GithubClient } from '../utils/github'

const MARKER_START = '<!-- lerna-release-action:version-preview:start -->'
const MARKER_END = '<!-- lerna-release-action:version-preview:end -->'
const BLOCK_REGEX = new RegExp(
  `\\n*${escapeRegex(MARKER_START)}[\\s\\S]*?${escapeRegex(MARKER_END)}\\n*`,
  'g'
)

export type PreviewRow = {
  pkg: string
  bump: Bump
  current: string
  next: string
}

type UpdatePreviewParams = {
  client: GithubClient
  repo: Repo
  prNumber: number
  prBody: string | null | undefined
  bumps: Record<string, Bump>
  packagePaths: Record<string, string>
  filesystem: Filesystem
}

/**
 * Render the version preview as a sentinel block at the bottom of the PR
 * body. On every run we strip any prior block (matched by paired HTML
 * markers) and re-append a fresh one — so reviewers always see the latest
 * computed bumps without a comment-spam.
 */
export async function updateVersionPreview({
  client,
  repo,
  prNumber,
  prBody,
  bumps,
  packagePaths,
  filesystem,
}: UpdatePreviewParams): Promise<void> {
  const rows = buildPreviewRows({ bumps, packagePaths, filesystem })
  const block = rows.length === 0 ? '' : renderPreviewBlock(rows)
  const nextBody = applyPreviewBlock(prBody ?? '', block)

  if (nextBody === (prBody ?? '')) {
    core.info('preview: PR body already matches the computed preview; no update needed')
    return
  }

  await client.rest.pulls.update({
    ...repo,
    pull_number: prNumber,
    body: nextBody,
  })

  if (block) core.info(`preview: refreshed version preview in PR #${prNumber} description`)
  else core.info(`preview: cleared stale version preview from PR #${prNumber} description`)
}

export function buildPreviewRows({
  bumps,
  packagePaths,
  filesystem,
}: {
  bumps: Record<string, Bump>
  packagePaths: Record<string, string>
  filesystem: Filesystem
}): PreviewRow[] {
  const rows: PreviewRow[] = []
  for (const [pkg, bump] of Object.entries(bumps)) {
    const pkgPath = packagePaths[pkg]
    if (!pkgPath) {
      core.warning(`preview: no workspace path for "${pkg}"; skipping`)
      continue
    }

    const current = readVersion({ filesystem, pkgPath })
    if (!current) {
      core.warning(`preview: could not read version for "${pkg}" at ${pkgPath}; skipping`)
      continue
    }

    rows.push({ pkg, bump, current, next: nextVersion(current, bump) })
  }

  rows.sort((a, b) => a.pkg.localeCompare(b.pkg))
  return rows
}

function readVersion({
  filesystem,
  pkgPath,
}: {
  filesystem: Filesystem
  pkgPath: string
}): string | null {
  const jsonPath = path.join(pkgPath, 'package.json')
  try {
    const raw = filesystem.readFileSync(jsonPath, 'utf8') as string
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

export function nextVersion(current: string, bump: Bump): string {
  const stripped = current.split(/[+-]/)[0] ?? current
  const [majorStr, minorStr, patchStr] = stripped.split('.')
  const major = Number(majorStr)
  const minor = Number(minorStr)
  const patch = Number(patchStr)
  if (![major, minor, patch].every(Number.isFinite)) return current
  if (bump === BUMP_MAJOR) return `${major + 1}.0.0`
  if (bump === BUMP_MINOR) return `${major}.${minor + 1}.0`
  if (bump === BUMP_PATCH) return `${major}.${minor}.${patch + 1}`
  return current
}

export function renderPreviewBlock(rows: PreviewRow[]): string {
  const lines = [
    MARKER_START,
    '## Version preview',
    '',
    'If merged as-is, this PR will release:',
    '',
    '| Package | Bump | Current | Next |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.pkg}\` | ${r.bump} | ${r.current} | ${r.next} |`),
    '',
    '_Computed by [`lerna-release-action/version-dispatch`](https://github.com/ExodusMovement/lerna-release-action) from per-commit file attribution. Refreshed on every push._',
    MARKER_END,
  ]
  return lines.join('\n')
}

/**
 * Strip any existing preview block from the body and append the new one at
 * the end (separated by a blank line). If `block` is empty, only the strip
 * happens — leaving the author's body untouched aside from the cleanup.
 */
export function applyPreviewBlock(body: string, block: string): string {
  const stripped = body.replace(BLOCK_REGEX, '\n').replace(/\s+$/u, '')
  if (!block) return stripped
  if (!stripped) return block
  return `${stripped}\n\n${block}`
}

function escapeRegex(value: string): string {
  return value.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
}

export const PREVIEW_MARKER_START = MARKER_START
export const PREVIEW_MARKER_END = MARKER_END
