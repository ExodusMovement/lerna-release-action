import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
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
 *   2. call `npm version <bump> --no-git-tag-version` inside that dir to
 *      bump only that package's package.json,
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
    if (!before) throw new Error(`Cannot read package.json for ${pkgName}`)

    core.info(`Running: npm version ${bump} --no-git-tag-version (in ${pkgDir})`)
    const npmStdout = spawnSync(
      'npm',
      ['version', bump, '--no-git-tag-version', '--allow-same-version'],
      { encoding: 'utf8', cwd: pkgDir }
    )
    core.debug(npmStdout)

    const after = readPackageJson(pkgDir)
    if (!after || typeof after.version !== 'string') {
      throw new Error(`package.json for ${pkgName} did not produce a version after bump`)
    }

    if (after.version === before.version) {
      throw new Error(
        `npm version did not change ${pkgName}'s version (still ${after.version}). Bump: ${bump}`
      )
    }

    const tag = `${pkgName}@${after.version}`
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

export default versionPackages
