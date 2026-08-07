import * as fs from 'fs'
import * as getStream from 'get-stream'
import * as path from 'path'
import * as core from '@actions/core'
import { readJson } from '../utils/fs'
import { PackageJson } from '../utils/types'
import * as createConfig from 'conventional-changelog-conventionalcommits'
import * as conventionalChangelogCore from 'conventional-changelog-core'
import { CommitWithFiles } from '../utils/pr-commits'
import {
  ParsedCommit,
  decomposeForPackage,
  extractPrNumber,
  formatCommitterDate,
} from './changelog-transform'
import { unwrapErrorMessage } from '../utils/errors'

// Supplied whenever this action generates changelogs itself — which, now that
// the conventional-commits path runs lerna with --no-changelog, is every path.
// A single squash commit can span multiple packages, so each squash commit in
// the changelog range is decomposed back into its pre-squash commits and
// re-attributed by file path (see {@link decomposeForPackage}). When the option
// is absent (e.g. unit tests), generation keeps conventional-changelog's
// default behavior byte-for-byte.
export type ChangelogAttribution = {
  packagePaths: Record<string, string>
  repoRelativePrefix?: string
  loadPrCommits: (prNumber: number) => Promise<CommitWithFiles[]>
}

const EOL = '\n'
const BLANK_LINE = EOL + EOL
const COMMIT_GUIDELINE =
  'See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.'
const CHANGELOG_HEADER = [
  '# Change Log',
  '',
  'All notable changes to this project will be documented in this file.',
  COMMIT_GUIDELINE,
].join(EOL)

function makeBumpOnlyFilter(packageName: string) {
  return (newEntry: string): string => {
    if (!newEntry.split('\n').some((line) => line.startsWith('*'))) {
      const message = `**Note:** Version bump only for package ${packageName}`
      return [newEntry.trim(), message, BLANK_LINE].join(BLANK_LINE)
    }

    return newEntry
  }
}

async function readExistingChangelog(packageDir: string): Promise<[string, string]> {
  const changelogPath = path.join(packageDir, 'CHANGELOG.md')

  const buffer = await fs.promises.readFile(changelogPath).catch(() => '')
  const contents = buffer.toString()

  const headerIndex = contents.indexOf(COMMIT_GUIDELINE)
  const contentsWithoutHeader =
    headerIndex === -1
      ? contents
      : contents.slice(headerIndex + COMMIT_GUIDELINE.length + BLANK_LINE.length)

  return [changelogPath, contentsWithoutHeader]
}

type TransformParams = ChangelogAttribution & {
  packageName: string
  parserOpts: unknown
}

/**
 * Build the `options.transform` hook for conventional-changelog-core. Core
 * invokes it once per commit in the changelog range (with the through-stream
 * as `this`), and a transform may emit any number of commits via `this.push`.
 * We use that to swap each squash commit for the subset of its pre-squash
 * commits that actually touched this package — see {@link decomposeForPackage}.
 */
function makePerPackageTransform({
  packageName,
  parserOpts,
  packagePaths,
  repoRelativePrefix,
  loadPrCommits,
}: TransformParams) {
  return function (
    this: { push: (commit: ParsedCommit) => void },
    commit: ParsedCommit,
    cb: (error?: Error | null) => void
  ): void {
    const push = this.push.bind(this)
    void (async () => {
      // Reproduce the one side effect of core's default transform that we are
      // replacing: the release-header date is derived from committerDate. Work
      // on a copy rather than mutating the streamed commit in place.
      const squash: ParsedCommit = commit.committerDate
        ? { ...commit, committerDate: formatCommitterDate(commit.committerDate) }
        : commit

      const prNumber = extractPrNumber(squash.header ?? squash.subject)
      if (prNumber == null) {
        // Not a squash merge (direct push, custom merge strategy): there is
        // nothing to decompose, so keep the commit as core parsed it.
        push(squash)
        return
      }

      let subCommits: CommitWithFiles[]
      try {
        subCommits = await loadPrCommits(prNumber)
      } catch (error) {
        core.warning(
          `changelog: could not load commits for PR #${prNumber} (${unwrapErrorMessage(
            error,
            'unknown error'
          )}); keeping the squash commit as-is`
        )
        push(squash)
        return
      }

      const emitted = decomposeForPackage({
        squash,
        subCommits,
        packageName,
        packagePaths,
        parserOpts,
        prNumber,
        repoRelativePrefix,
      })

      if (emitted.length === 0) {
        core.debug(
          `changelog: PR #${prNumber} touched ${packageName} but no pre-squash commit attributed to it; omitting`
        )
      }

      for (const entry of emitted) push(entry)
    })().then(
      () => cb(),
      (error: Error) => cb(error)
    )
  }
}

export default async function updateChangelog(
  packageDir: string,
  attribution?: ChangelogAttribution
) {
  const config = await createConfig()
  core.debug(JSON.stringify(config))

  const packageJson = await readJson<PackageJson>(path.join(packageDir, 'package.json'), {
    filesystem: fs,
  })

  if (!packageJson) {
    throw new Error(`package.json does not exist in ${packageDir}`)
  }

  const options: Record<string, unknown> = {
    pkg: { path: path.join(packageDir, 'package.json') },
    config: config.conventionalChangelog,
    lernaPackage: packageJson.name,
  }

  if (attribution) {
    options.transform = makePerPackageTransform({
      packageName: packageJson.name,
      parserOpts: config.parserOpts,
      ...attribution,
    })
  }

  const gitRawCommitsOpts = Object.assign({}, config.conventionalChangelog?.gitRawCommitsOpts, {
    path: packageDir,
  })

  const changelogStream = conventionalChangelogCore(options, {}, gitRawCommitsOpts)

  const [newEntry, [changelogPath, changelogContents]] = await Promise.all([
    getStream(changelogStream).then(makeBumpOnlyFilter(packageJson.name)),
    readExistingChangelog(packageDir),
  ])

  const content = [CHANGELOG_HEADER, newEntry, changelogContents].join(BLANK_LINE)

  await fs.promises.writeFile(changelogPath, content.trim() + EOL)
}
