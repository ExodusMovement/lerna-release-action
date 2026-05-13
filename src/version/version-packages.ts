import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import semverInc = require('semver/functions/inc')
import type { ReleaseType } from 'semver'
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
 *      other byte — formatting, trailing newlines, key order),
 *   3. commit just that package.json,
 *   4. create the lerna-style `<pkg-name>@<new-version>` annotated tag at
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
 * @returns the number of commits (= number of bumps entries successfully versioned).
 */
export function versionPackagesExplicit({ bumps, packages }: ExplicitParams): number {
  const dirByName = new Map<string, string>()
  for (const pkgPath of packages) {
    const pkg = readPackageJson(pkgPath)
    if (pkg && typeof pkg.name === 'string') dirByName.set(pkg.name, pkgPath)
  }

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

    const next = semverInc(before.version, bump as ReleaseType)
    if (!next) {
      throw new Error(
        `semver.inc rejected bump for ${pkgName}: ${before.version} + "${bump}". Valid bumps: major, minor, patch, premajor, preminor, prepatch, prerelease.`
      )
    }

    core.info(`Bumping ${pkgName}: ${before.version} → ${next} (${bump}) in ${pkgDir}`)
    writeVersionField({ pkgDir, next })

    const tag = `${pkgName}@${next}`
    spawnSync('git', ['add', path.join(pkgDir, 'package.json')], { encoding: 'utf8' })
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

export default versionPackages
