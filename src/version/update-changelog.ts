import * as fs from 'fs'
import * as getStream from 'get-stream'
import * as path from 'path'
import { readJson } from '../utils/fs'
import { PackageJson } from '../utils/types'

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

// dynamic imports such as await import() are bundled by vercel/ncc. We need to import at runtime
const importDynamically = new Function('p', 'return import(p)') // eslint-disable-line no-new-func

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

export default async function updateChangelog(packageDir: string) {
  const config = await importDynamically('conventional-changelog-conventionalcommits')
  const conventionalChangelogCore = await importDynamically('conventional-changelog-core')
  const packageJson = await readJson<PackageJson>(packageDir, { filesystem: fs })

  if (!packageJson) {
    throw new Error(`package.json does not exist in ${packageDir}`)
  }

  const options = {
    pkg: { path: path.join(packageDir, 'package.json') },
    config: config.conventionalChangelog,
    lernaPackage: packageJson.name,
  }

  const gitRawCommitsOpts = Object.assign({}, options.config.gitRawCommitsOpts, {
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
