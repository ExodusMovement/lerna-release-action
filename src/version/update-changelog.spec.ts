import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import updateChangelog, { ChangelogAttribution } from './update-changelog'
import { CommitWithFiles } from '../utils/pr-commits'

// conventional-changelog-core shells out to git, so this exercises the real
// pipeline end to end against a throwaway repository.

const PKG = '@scope/fusion'
const FUSION_DIR = 'features/fusion'
const KEYCHAIN_DIR = 'features/keychain'

// A GitHub squash commit collapses PR #42's two commits into one message and
// touches both packages' files — exactly the shape that leaks keychain's
// breaking footer into fusion's changelog.
const SQUASH_MESSAGE = [
  'refactor(keychain)!: rename addSeed/removeAllSeeds to unlock/lock (#42)',
  '',
  '* refactor(keychain)!: rename addSeed/removeAllSeeds to unlock/lock',
  '',
  'BREAKING CHANGE: keychain.addSeed is renamed to keychain.unlock.',
  '',
  'Co-Authored-By: Someone <someone@example.com>',
  '',
  '* fix(fusion): adopt keychain unlock/lock rename',
].join('\n')

const PR_42_COMMITS: CommitWithFiles[] = [
  {
    sha: 'aaaaaaa',
    message:
      'refactor(keychain)!: rename addSeed/removeAllSeeds to unlock/lock\n\nBREAKING CHANGE: keychain.addSeed is renamed to keychain.unlock.',
    files: [`${KEYCHAIN_DIR}/module/index.ts`],
  },
  {
    sha: 'bbbbbbb',
    message: 'fix(fusion): adopt keychain unlock/lock rename',
    files: [`${FUSION_DIR}/src/index.ts`],
  },
]

const attribution: ChangelogAttribution = {
  packagePaths: { [PKG]: FUSION_DIR, '@scope/keychain': KEYCHAIN_DIR },
  repoRelativePrefix: '',
  loadPrCommits: async () => PR_42_COMMITS,
}

let repo: string
let cwd: string

function git(args: string[], env: Record<string, string> = {}) {
  execFileSync('git', args, { cwd: repo, env: { ...process.env, ...env }, stdio: 'pipe' })
}

function writeFile(relativePath: string, contents: string) {
  const full = path.join(repo, relativePath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, contents)
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lra-changelog-'))
  cwd = process.cwd()

  git(['init', '-q', '-b', 'master'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test'])
  git(['config', 'commit.gpgsign', 'false'])

  writeFile(`${FUSION_DIR}/package.json`, JSON.stringify({ name: PKG, version: '1.0.0' }))
  writeFile(
    `${FUSION_DIR}/CHANGELOG.md`,
    '# Change Log\n\nAll notable changes to this project will be documented in this file.\nSee [Conventional Commits](https://conventionalcommits.org) for commit guidelines.\n'
  )
  writeFile(`${FUSION_DIR}/src/index.ts`, 'export const v = 0\n')
  writeFile(`${KEYCHAIN_DIR}/module/index.ts`, 'export const k = 0\n')
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'chore: baseline'])
  git(['tag', `${PKG}@1.0.0`])

  // The bumped version package.json + the cross-package squash commit.
  writeFile(`${FUSION_DIR}/package.json`, JSON.stringify({ name: PKG, version: '1.1.0' }))
  writeFile(`${FUSION_DIR}/src/index.ts`, 'export const v = 1\n')
  writeFile(`${KEYCHAIN_DIR}/module/index.ts`, 'export const k = 1\n')
  git(['add', '-A'])
  const date = '2026-06-29T12:00:00Z'
  git(['commit', '-q', '-m', SQUASH_MESSAGE], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  })

  process.chdir(repo)
})

afterEach(() => {
  process.chdir(cwd)
  fs.rmSync(repo, { recursive: true, force: true })
})

const readChangelog = () => fs.readFileSync(path.join(repo, FUSION_DIR, 'CHANGELOG.md'), 'utf8')

describe('updateChangelog with per-package attribution', () => {
  it("does not leak another package's breaking change into this package", async () => {
    await updateChangelog(path.join(repo, FUSION_DIR), attribution)
    const changelog = readChangelog()

    expect(changelog).toContain('## [1.1.0]')
    expect(changelog).toContain('### Bug Fixes')
    expect(changelog).toContain('adopt keychain unlock/lock rename')
    // The (#42) link and the squash commit hash, not the pre-squash shas.
    expect(changelog).toContain('#42')

    expect(changelog).not.toContain('BREAKING')
    expect(changelog).not.toContain('addSeed')
    expect(changelog).not.toContain('Co-Authored-By')
  })

  it('dates the release header from the squash commit', async () => {
    await updateChangelog(path.join(repo, FUSION_DIR), attribution)
    expect(readChangelog()).toContain('(2026-06-29)')
  })
})

describe('updateChangelog without attribution (legacy path)', () => {
  it('reproduces the leak — confirming the fix is what removes it', async () => {
    await updateChangelog(path.join(repo, FUSION_DIR))
    const changelog = readChangelog()

    // The default conventional-changelog behavior renders the whole squash
    // message, dragging keychain's breaking footer into fusion's changelog.
    expect(changelog).toContain('BREAKING')
  })
})
