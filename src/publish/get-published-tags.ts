import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'

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
  const files = await client.paginate(client.rest.pulls.listFiles, {
    ...repo,
    pull_number: prNumber,
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

// ponytail: one `npm view` per changed package — fine for the handful a release
// touches. npm exits 0 and prints the version when it's live; a 404 (never
// published) or a transient error exits non-zero, so the tag is skipped and
// recovered on the next release run (createTags is idempotent).
function isPublished(name: string, version: string): boolean {
  const { stdout, status } = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    encoding: 'utf8',
    maxBuffer: Number.MAX_SAFE_INTEGER,
  })

  return status === 0 && stdout.trim() !== ''
}
