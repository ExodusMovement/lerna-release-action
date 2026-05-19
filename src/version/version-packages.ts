import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import semverInc = require('semver/functions/inc')
import type { ReleaseType } from 'semver'
import { getPathsByPackageNames } from '@exodus/lerna-utils'
import { strategyAsArgument, VersionStrategy } from './strategy'
import { spawnSync } from '../utils/process'

type Params = {
  extraArgs?: string
  versionStrategy: VersionStrategy
}

function versionPackages({ extraArgs, versionStrategy }: Params) {
  const args = [
    'lerna',
    'version',
    strategyAsArgument(versionStrategy),
    '--no-push',
    '--force-git-tag',
    '--yes',
    '--no-private',
    '--force-publish',
  ]

  if (extraArgs) {
    args.push(...extraArgs.split(' '))
  }

  const stdout = spawnSync('npx', args, { encoding: 'utf8' })
  core.debug(stdout)
}

type ExplicitParams = {
  bumps: Record<string, string>
  packages: string[]
}

/**
 * Bumps versions one package at a time. lerna 9's `version` command does
 * not accept `--scope`, so this path bypasses `lerna version` entirely:
 *
 *   1. resolve each `bumps` entry's package name to a directory by reading
 *      package.json from the supplied `packages` list,
 *   2. compute the next version via `semver.inc(current, bump)` and rewrite
 *      the `"version"` field in package.json in place (preserving every
 *      other byte — formatting, trailing newlines, key order). When the
 *      current version is itself a prerelease (`5.0.0-rc.96`), the bump
 *      is downgraded to `prerelease` so the rc counter advances
 *      (`5.0.0-rc.97`) — a commit-driven `major` bump shouldn't promote
 *      a long-lived rc to a stable release; the team must do that via
 *      a separate workflow.
 *   3. on major bumps only, rewrite the bumped package's pin in every
 *      workspace package.json that uses a semver range. Minor and patch
 *      bumps don't need a rewrite — the existing caret/tilde range
 *      already satisfies the new version, so yarn keeps resolving the
 *      workspace symlink. `workspace:*` / `workspace:^` / `npm:` aliases /
 *      `file:` / `link:` / URLs and dist-tags (`*`, `latest`) are
 *      never rewritten regardless of bump level.
 *   4. commit the bumped package.json + every consumer package.json that
 *      changed,
 *   5. create the lerna-style `<pkg-name>@<new-version>` annotated tag at
 *      that commit.
 *
 * Each entry produces its own commit + tag, mirroring the per-package
 * structure of a normal `lerna version` run with all packages bumped
 * uniformly. The caller is responsible for collapsing the N commits into
 * one (via `resetCommits({ flags: { mixed: true }, count: N })`) before
 * pushing — return value carries the count.
 *
 * Why not shell out to `npm version`? `npm` rejects yarn's `workspace:*`
 * protocol with EUNSUPPORTEDPROTOCOL when it parses package.json, even if
 * the workspace ref lives only in devDependencies and the bump itself
 * doesn't touch deps. Editing the `"version"` field directly sidesteps
 * the issue entirely.
 *
 * Why update consumer pins? When the workspace version of `pkgX` moves
 * from `2.1.1` to `3.0.0`, every consumer's `^2.0.1` pin no longer
 * satisfies the workspace version. Yarn falls back to whatever 2.x is
 * published on the registry, which still has the *old* source — breaking
 * any consumer that needs the new API. lerna's `version` flow updates
 * these refs automatically; we mimic that behavior on the explicit path.
 *
 * @returns the number of commits (= number of bumps entries successfully versioned).
 */
export async function versionPackagesExplicit({
  bumps,
  packages,
}: ExplicitParams): Promise<number> {
  const dirByName = new Map<string, string>()
  for (const pkgPath of packages) {
    const pkg = readPackageJson(pkgPath)
    if (pkg && typeof pkg.name === 'string') dirByName.set(pkg.name, pkgPath)
  }

  // Discover ALL workspace packages so consumer-pin updates reach
  // packages that weren't themselves bumped this run.
  const workspacePaths = Object.values(await getPathsByPackageNames({ filesystem: fs }))

  let count = 0
  for (const [pkgName, bump] of Object.entries(bumps)) {
    const pkgDir = dirByName.get(pkgName)
    if (!pkgDir) {
      throw new Error(
        `Cannot version "${pkgName}" — not present in \`packages\`. Pass every bump's target in the \`packages\` input.`
      )
    }

    const before = readPackageJson(pkgDir)
    if (!before || typeof before.version !== 'string') {
      throw new Error(`Cannot read version from package.json for ${pkgName}`)
    }

    // While a package is in a prerelease cycle (`5.0.0-rc.96`), any
    // commit-driven bump (`major`/`minor`/`patch`) should bump the rc
    // counter rather than drop the prerelease. A `feat!:` on a long-lived
    // rc shouldn't accidentally promote it to a stable release — the team
    // must promote via a separate workflow when they're ready.
    const effectiveBump: ReleaseType = isPrerelease(before.version)
      ? 'prerelease'
      : (bump as ReleaseType)

    const next = semverInc(before.version, effectiveBump)
    if (!next) {
      throw new Error(
        `semver.inc rejected bump for ${pkgName}: ${before.version} + "${effectiveBump}". Valid bumps: major, minor, patch, premajor, preminor, prepatch, prerelease.`
      )
    }

    if (effectiveBump === bump) {
      core.info(`Bumping ${pkgName}: ${before.version} → ${next} (${bump}) in ${pkgDir}`)
    } else {
      core.info(
        `Bumping ${pkgName}: ${before.version} → ${next} (requested ${bump}; downgraded to ${effectiveBump} because current is a prerelease) in ${pkgDir}`
      )
    }

    writeVersionField({ pkgDir, next })

    const updatedConsumers = isMajorBump(before.version, next)
      ? updateConsumerPins({
          pkgName,
          newVersion: next,
          workspaces: workspacePaths,
          ownDir: pkgDir,
        })
      : []

    const tag = `${pkgName}@${next}`
    spawnSync('git', ['add', path.join(pkgDir, 'package.json')], { encoding: 'utf8' })
    for (const file of updatedConsumers) {
      spawnSync('git', ['add', file], { encoding: 'utf8' })
    }

    spawnSync('git', ['commit', '-m', `chore(release): publish ${tag}`], { encoding: 'utf8' })
    spawnSync('git', ['tag', '-a', tag, '-m', tag], { encoding: 'utf8' })
    count++

    core.info(`Bumped ${tag} (was ${before.version})`)
  }

  return count
}

function readPackageJson(dir: string): { name?: string; version?: string } | null {
  const file = path.join(dir, 'package.json')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Rewrite the `"version"` field of a package.json in place, preserving
 * every other byte (formatting, trailing newline, key order). Mirrors
 * what `npm version --no-git-tag-version` does for the bump itself, but
 * without invoking npm — so packages with `workspace:*` deps don't trip
 * `EUNSUPPORTEDPROTOCOL`.
 */
function writeVersionField({ pkgDir, next }: { pkgDir: string; next: string }): void {
  const file = path.join(pkgDir, 'package.json')
  const raw = fs.readFileSync(file, 'utf8')
  const updated = raw.replace(/("version"\s*:\s*)"[^"]+"/, `$1"${next}"`)
  if (updated === raw) {
    throw new Error(`Failed to locate a "version" field in ${file}`)
  }

  fs.writeFileSync(file, updated)
}

/**
 * Rewrite every workspace package.json that pins `pkgName` to a semver
 * range, replacing the range's version with `newVersion`. Preserves the
 * existing range prefix (`^`, `~`, `>=`, …) or defaults to `^` for exact
 * pins. Skips `workspace:*` / `npm:` aliases / `file:` paths / URL refs
 * / dist-tags (`latest`, `*`).
 *
 * @returns absolute paths of files that were modified.
 */
function updateConsumerPins({
  pkgName,
  newVersion,
  workspaces,
  ownDir,
}: {
  pkgName: string
  newVersion: string
  workspaces: string[]
  ownDir: string
}): string[] {
  const updated: string[] = []
  for (const wsPath of workspaces) {
    if (wsPath === ownDir) continue
    const file = path.join(wsPath, 'package.json')
    let raw: string
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }

    const next = rewriteConsumerPin({ raw, pkgName, newVersion })
    if (next !== raw) {
      fs.writeFileSync(file, next)
      updated.push(file)
      core.info(`  updated ${pkgName} pin in ${wsPath}/package.json`)
    }
  }

  return updated
}

function rewriteConsumerPin({
  raw,
  pkgName,
  newVersion,
}: {
  raw: string
  pkgName: string
  newVersion: string
}): string {
  const escaped = pkgName.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
  // "<pkgName>": "<value>" — value captured separately so we can decide
  // per-entry whether to rewrite it.
  const pattern = new RegExp(`("${escaped}"\\s*:\\s*)"([^"]+)"`, 'g')
  return raw.replace(pattern, (match, jsonPrefix, value) => {
    if (!shouldRewriteRange(value)) return match
    const rangeMatch = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(value)
    if (!rangeMatch) return match
    const rangePrefix = rangeMatch[1] ?? '^'
    return `${jsonPrefix}"${rangePrefix}${newVersion}"`
  })
}

function isMajorBump(oldVersion: string, newVersion: string): boolean {
  return oldVersion.split('.')[0] !== newVersion.split('.')[0]
}

function isPrerelease(version: string): boolean {
  return version.includes('-')
}

const NON_SEMVER_PREFIXES = ['workspace:', 'npm:', 'file:', 'link:', 'portal:']

function shouldRewriteRange(value: string): boolean {
  if (NON_SEMVER_PREFIXES.some((p) => value.startsWith(p))) return false
  if (value.includes('://')) return false
  // tags like '*' / 'latest' / 'next' carry no digits — leave them alone
  return /\d/.test(value)
}

export default versionPackages
