import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import * as semver from 'semver'
import { getPackagePaths } from '@exodus/lerna-utils'
import { spawnSync } from './utils/process'
import { filesToPackages } from './action/version-dispatch/files-to-packages'
import { Bump, BUMP_NONE, bumpFromMessage, maxBump } from './action/version-dispatch/bumps'

type Pkg = { dir: string; name: string; version: string; private?: boolean }
type CommitWithFiles = { sha: string; message: string; files: string[] }

const readPkg = (dir: string): Pkg => ({
  dir,
  ...JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')),
})
const git = (...args: string[]): string => spawnSync('git', args)
const firstLine = (message: string): string => message.split('\n', 1)[0]!.trim()

const PR_REF = /\(#(\d+)\)\s*$/
export const parsePrNumber = (subject: string): number | null => {
  const match = PR_REF.exec(subject.trim())
  return match ? Number(match[1]) : null
}

/**
 * Baseline = the highest `<name>@<version>` tag whose version is `<=` the
 * package's current package.json version. Anchoring at-or-below the working
 * version (a) ties the diff to THIS package's release lineage, ignoring higher
 * tags left behind by an unrelated package that once shared the name, and
 * (b) tolerates a version bumped but not yet tagged. `null` = never released.
 * Exported for tests.
 */
export const baselineTag = (name: string, version: string, tags: string[]): string | null => {
  const prefix = `${name}@`
  const versions = tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .filter((candidate) => semver.valid(candidate) && semver.lte(candidate, version))
  if (versions.length === 0) return null
  return `${prefix}${semver.rsort(versions)[0]}`
}

/**
 * Faithful, log-free port of version-dispatch's `aggregateBumps`: per-commit
 * file attribution with a PR-title fallback when no individual commit yields a
 * bump. ponytail: kept in sync by hand; extract a shared pure copy upstream if
 * the two ever need to move in lockstep. Exported for tests.
 */
export const aggregateBumps = (
  commits: CommitWithFiles[],
  packagePaths: Record<string, string>,
  prTitle: string
): Record<string, Bump> => {
  const bumps: Record<string, Bump> = {}
  const touchedAcrossPr = new Set<string>()

  for (const commit of commits) {
    const bump = bumpFromMessage(commit.message)
    const packages = filesToPackages(commit.files, packagePaths)
    for (const name of packages) touchedAcrossPr.add(name)
    if (bump === BUMP_NONE || packages.size === 0) continue
    for (const name of packages) bumps[name] = maxBump(bumps[name] ?? BUMP_NONE, bump)
  }

  if (Object.keys(bumps).length > 0) return bumps

  const titleBump = bumpFromMessage(prTitle)
  if (titleBump !== BUMP_NONE && touchedAcrossPr.size > 0) {
    return Object.fromEntries([...touchedAcrossPr].map((name) => [name, titleBump]))
  }

  return {}
}

// GitHub retains a merged PR's pre-squash commits at refs/pull/<n>/head even
// after the branch is deleted. Fetch them all into refs/prs/<n> in one round
// trip. ponytail: single batched fetch; chunk the refspecs for huge backlogs.
const fetchPrRefs = (prs: number[]): void => {
  if (prs.length === 0) return
  spawnSync('git', [
    'fetch',
    '--quiet',
    'origin',
    ...prs.map((pr) => `+refs/pull/${pr}/head:refs/prs/${pr}`),
  ])
}

const cleanupPrRefs = (prs: number[]): void => {
  for (const pr of prs) {
    try {
      spawnSync('git', ['update-ref', '-d', `refs/prs/${pr}`])
    } catch {
      /* ref already gone */
    }
  }
}

// Per-package bumps a PR would produce, reconstructed from its retained head
// ref — the same per-commit attribution version-dispatch uses. One `git log`
// reads every commit's message and files at once. Requires the ref fetched.
const bumpsForPr = (
  pr: number,
  packagePaths: Record<string, string>,
  prTitle = '',
  mainline = 'HEAD'
): Record<string, Bump> => {
  const ref = `refs/prs/${pr}`
  const base = git('merge-base', ref, mainline).trim()
  const raw = git('log', `${base}..${ref}`, '--format=%x00%H%x1e%B%x1e', '--name-only')
  const commits: CommitWithFiles[] = raw
    .split('\0')
    .filter((record) => record.trim())
    .map((record) => {
      const [sha = '', message = '', files = ''] = record.split('\x1E')
      return {
        sha: sha.trim(),
        message,
        files: files
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean),
      }
    })
  return aggregateBumps(commits, packagePaths, prTitle)
}

// HEAD-side line numbers actually changed between `base` and HEAD within `dir`.
const changedLines = (base: string, dir: string): Record<string, number[]> => {
  const diff = git('diff', '--unified=0', '--no-color', base, 'HEAD', '--', dir)
  const perFile: Record<string, number[]> = {}
  let file: string | null = null
  let headLine = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.startsWith('+++ b/') ? line.slice(6) : null
      if (file) perFile[file] = []
      continue
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      headLine = Number(hunk[1])
      continue
    }

    if (file && line.startsWith('+') && !line.startsWith('+++')) {
      perFile[file]!.push(headLine)
      headLine++
    }
  }

  return perFile
}

// The commits that authored the given HEAD-side lines (blame attributes the
// SURVIVING change to its real commit — so already-released content, unchanged
// since the tag, never appears, and squashed commits map to their PR subject).
const blameShas = (file: string, lines: number[]): string[] => {
  if (lines.length === 0) return []
  let out: string
  try {
    out = git('blame', '--line-porcelain', 'HEAD', '--', file)
  } catch {
    return []
  }

  const shaByLine = out
    .split('\n')
    .filter((l) => /^[\da-f]{40} /.test(l))
    .map((l) => l.slice(0, 40))
  const shas = lines.map((n) => shaByLine[n - 1]).filter((s): s is string => s !== undefined)
  return [...new Set(shas)]
}

/**
 * Repo-relative paths of every non-private package with a releasing change
 * (feat/fix/perf/breaking) since its last release that is still present on
 * HEAD. The pipeline is content-anchored end to end so hydra's messy tag
 * history can't inflate the result:
 *
 *  1. Baseline on the `<name>@<version>` tag at-or-below package.json version.
 *  2. Gate on the actual `base..HEAD` content diff for the dir (no diff → up
 *     to date, even if commit ancestry suggests otherwise).
 *  3. Attribute only the SURVIVING changed lines, via blame, to the PR that
 *     produced them — then ask that PR's pre-squash commits (its head ref)
 *     whether they actually release THIS package. This rejects both already
 *     released commits leaking through non-linear history and `feat`-titled
 *     sweeps whose real per-package change was a chore.
 *
 * Never-released packages are always included. ponytail: blame + one head-ref
 * fetch per candidate PR — run on an up-to-date default branch; heavy on a
 * large backlog but this is a deliberate, occasional sweep.
 */
export default async function listUnreleased(): Promise<string[]> {
  const paths = await getPackagePaths()
  const packages = paths.map(readPkg)
  const packagePaths = Object.fromEntries(packages.map((pkg) => [pkg.name, pkg.dir]))
  const tags = git('tag').split('\n').filter(Boolean)

  type Candidate = { pkg: Pkg; prs: Set<number>; direct: boolean; never: boolean }
  const candidates: Candidate[] = []
  const prTitles = new Map<number, string>()
  const subjectCache = new Map<string, string>()
  const subjectOf = (sha: string): string => {
    let subject = subjectCache.get(sha)
    if (subject === undefined) {
      subject = firstLine(git('show', '-s', '--format=%s', sha))
      subjectCache.set(sha, subject)
    }

    return subject
  }

  for (const pkg of packages) {
    if (pkg.private) continue
    const base = baselineTag(pkg.name, pkg.version, tags)
    if (base === null) {
      candidates.push({ pkg, prs: new Set(), direct: false, never: true })
      continue
    }

    // Relocation/stale-tag guard: if the baseline tag's tree has no files at the
    // package's current path, the package was moved (or the tag is bogus), so a
    // `base..HEAD` diff would report the whole package as new. We can't trust the
    // baseline — surface it for manual review instead of over-stating it.
    if (!git('ls-tree', '-r', '--name-only', `${base}^{tree}`, '--', pkg.dir).trim()) {
      process.stderr.write(
        `skip ${pkg.name}: baseline ${base} has no files at ${pkg.dir} (relocated or stale tag) — verify manually\n`
      )
      continue
    }

    if (!git('diff', '--name-only', base, 'HEAD', '--', pkg.dir).trim()) continue // up to date

    const shas = new Set<string>()
    for (const [file, lines] of Object.entries(changedLines(base, pkg.dir))) {
      for (const sha of blameShas(file, lines)) shas.add(sha)
    }

    const prs = new Set<number>()
    let direct = false
    for (const sha of shas) {
      const subject = subjectOf(sha)
      const pr = parsePrNumber(subject)
      if (pr !== null) {
        prs.add(pr)
        if (!prTitles.has(pr)) prTitles.set(pr, subject)
      } else if (bumpFromMessage(git('show', '-s', '--format=%B', sha)) !== BUMP_NONE) {
        direct = true // non-squash / direct-to-master commit — its subject is real
      }
    }

    candidates.push({ pkg, prs, direct, never: false })
  }

  const allPrs = [...new Set(candidates.flatMap((candidate) => [...candidate.prs]))]
  const prBumps = new Map<number, Record<string, Bump>>()
  if (allPrs.length > 0) {
    fetchPrRefs(allPrs)
    for (const pr of allPrs) {
      try {
        prBumps.set(pr, bumpsForPr(pr, packagePaths, prTitles.get(pr) ?? ''))
      } catch {
        // unfetchable ref → fall back to the squash subject's bump
        prBumps.set(
          pr,
          bumpFromMessage(prTitles.get(pr) ?? '') === BUMP_NONE ? {} : { __fallback__: BUMP_NONE }
        )
      }
    }

    cleanupPrRefs(allPrs)
  }

  return candidates
    .filter(({ pkg, prs, direct, never }) => {
      if (never || direct) return true
      return [...prs].some((pr) => {
        const bumps = prBumps.get(pr) ?? {}
        return '__fallback__' in bumps || pkg.name in bumps
      })
    })
    .map(({ pkg }) => pkg.dir)
}
