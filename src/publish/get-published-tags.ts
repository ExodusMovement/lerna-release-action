import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import * as core from '@actions/core'
import retry from 'p-retry'

import { GithubClient } from '../utils/github'
import { Repo, PackageJson } from '../utils/types'

type Params = {
  client: GithubClient
  repo: Repo
  prNumber: number
}

// Recovers the `name@version` tags for packages that actually reached npm by
// reading the release PR's changed package.json files and checking each against
// the registry.
//
// `lerna publish` aborts on the first package it can't publish (e.g. a new
// package the bot lacks access to) and exits before writing its summary file,
// so the packages it *did* publish would otherwise go untagged. Missing tags
// drift git from npm and make the next release regenerate already-shipped
// changelog entries — sometimes as a false-positive breaking change. Tagging
// from npm instead of the summary decouples the published packages from the
// failed one.
export async function getPublishedTags({ client, repo, prNumber }: Params): Promise<string[]> {
  // The preceding `lerna publish` blocks the process for 30-60s, long enough
  // for GitHub to close octokit's idle keep-alive socket; the first request
  // after it fails with `SocketError: other side closed`. Retry like
  // `createTags` does, so a dead socket costs a round trip instead of the run.
  const listFiles = () =>
    client.paginate(client.rest.pulls.listFiles, {
      ...repo,
      pull_number: prNumber,
    })

  const files = await retry(listFiles, {
    retries: 5,
    onFailedAttempt: (error) => {
      core.warning(
        `Failed to list files of PR #${prNumber}: ${error.message}. There are ${error.retriesLeft} retries left`
      )
    },
  })

  const manifests = files
    .map((file) => file.filename)
    .filter((filename) => filename.endsWith('package.json'))

  const tags: string[] = []
  for (const manifest of manifests) {
    const pkg = readManifest(manifest)
    if (!pkg?.name || !pkg.version || pkg.private) continue

    if (isPublished(pkg.name, pkg.version)) {
      tags.push(`${pkg.name}@${pkg.version}`)
    }
  }

  return tags
}

function readManifest(path: string): PackageJson | undefined {
  try {
    return JSON.parse(fs.readFileSync(path, { encoding: 'utf8' })) as PackageJson
  } catch {
    return undefined
  }
}

// One `npm view` per changed package — fine for the handful a release touches.
// npm exits 0 and prints the version when it's live; an empty stdout (existing
// package, missing version) or a 404 (never published) means it's not. Retry on
// a non-zero exit to ride out transient registry errors; a genuine 404 just
// costs 3 quick calls (and only for the failed package).
function isPublished(name: string, version: string): boolean {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { stdout, status } = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
      encoding: 'utf8',
      maxBuffer: Number.MAX_SAFE_INTEGER,
    })

    if (status === 0) return stdout.trim() === version
  }

  return false
}
