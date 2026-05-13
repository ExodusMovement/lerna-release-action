import * as path from 'path'
import * as core from '@actions/core'
import semverInc = require('semver/functions/inc')
import type { ReleaseType } from 'semver'
import { Bump } from './bumps'
import { Filesystem, Repo } from '../utils/types'
import { GithubClient } from '../utils/github'

const MARKER = '<!-- lerna-release-action:version-preview -->'

export type PreviewRow = {
  pkg: string
  bump: Bump
  current: string
  next: string
}

type PostPreviewParams = {
  client: GithubClient
  repo: Repo
  prNumber: number
  bumps: Record<string, Bump>
  packagePaths: Record<string, string>
  filesystem: Filesystem
}

/**
 * Post the version preview as a sticky comment on the PR. On every run we
 * delete every prior preview comment (matched by a hidden HTML marker)
 * and post a fresh one at the end of the conversation — so reviewers
 * always see exactly one preview comment, anchored to the latest push.
 */
export async function postVersionPreview({
  client,
  repo,
  prNumber,
  bumps,
  packagePaths,
  filesystem,
}: PostPreviewParams): Promise<void> {
  const rows = buildPreviewRows({ bumps, packagePaths, filesystem })
  const body = rows.length === 0 ? '' : renderPreviewComment(rows)

  const deleted = await deleteExistingPreviewComments({ client, repo, prNumber })

  if (!body) {
    if (deleted > 0) core.info(`preview: cleared ${deleted} stale preview comment(s)`)
    else core.info('preview: no bumps from this PR; nothing to post')
    return
  }

  await client.rest.issues.createComment({
    ...repo,
    issue_number: prNumber,
    body,
  })
  core.info(`preview: posted version preview to PR #${prNumber}`)
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
  return semverInc(current, bump as ReleaseType) ?? current
}

export function renderPreviewComment(rows: PreviewRow[]): string {
  const lines = [
    MARKER,
    '## Version preview',
    '',
    'If merged as-is, this PR will release:',
    '',
    '| Package | Bump | Current | Next |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.pkg}\` | ${r.bump} | ${r.current} | ${r.next} |`),
    '',
    '_Computed by [`lerna-release-action/version-dispatch`](https://github.com/ExodusMovement/lerna-release-action) from per-commit file attribution. Re-posted on every push so the latest preview is always at the end of this thread._',
  ]
  return lines.join('\n')
}

/**
 * Delete every prior preview comment on the PR. Used by the action's
 * early-return paths (excluded label, wrong base branch, no workspace
 * packages, etc.) to make sure a previously-posted preview comment
 * does not linger after the PR transitions into a gated state.
 */
export async function clearVersionPreview({
  client,
  repo,
  prNumber,
}: {
  client: GithubClient
  repo: Repo
  prNumber: number
}): Promise<void> {
  const deleted = await deleteExistingPreviewComments({ client, repo, prNumber })
  if (deleted > 0) core.info(`preview: cleared ${deleted} stale preview comment(s)`)
}

async function deleteExistingPreviewComments({
  client,
  repo,
  prNumber,
}: {
  client: GithubClient
  repo: Repo
  prNumber: number
}): Promise<number> {
  const comments = await client.paginate(client.rest.issues.listComments, {
    ...repo,
    issue_number: prNumber,
    per_page: 100,
  })
  const stale = comments.filter((c) => typeof c.body === 'string' && c.body.includes(MARKER))
  for (const c of stale) {
    try {
      await client.rest.issues.deleteComment({ ...repo, comment_id: c.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      core.warning(`preview: failed to delete stale comment ${c.id}: ${message}`)
    }
  }

  return stale.length
}

export const PREVIEW_MARKER = MARKER
