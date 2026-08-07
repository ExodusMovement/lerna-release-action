import * as createConfig from 'conventional-changelog-conventionalcommits'
import { decomposeForPackage, extractPrNumber, formatCommitterDate } from './changelog-transform'
import { CommitWithFiles } from '../utils/pr-commits'

type Note = { title: string; text: string }

describe('extractPrNumber', () => {
  it('extracts the trailing squash PR number', () => {
    expect(extractPrNumber('refactor(keychain)!: rename addSeed (#17038)')).toBe(17_038)
    expect(extractPrNumber('fix(fusion): keychain type (#17399)')).toBe(17_399)
  })

  it('reads only the first line', () => {
    expect(extractPrNumber('fix: thing (#5)\n\nsee also (#999)')).toBe(5)
  })

  it('returns null without a trailing reference', () => {
    expect(extractPrNumber('chore(release): publish @exodus/fusion')).toBeNull()
    expect(extractPrNumber('fix: closes #42 mid-subject')).toBeNull()
    expect(extractPrNumber(undefined)).toBeNull()
    expect(extractPrNumber('')).toBeNull()
  })
})

describe('formatCommitterDate', () => {
  it('formats git %ci output to yyyy-mm-dd in UTC', () => {
    expect(formatCommitterDate('2026-06-29 17:42:51 +0000')).toBe('2026-06-29')
  })

  it('formats strict ISO (%cI) dates', () => {
    expect(formatCommitterDate('2026-06-29T17:42:51+00:00')).toBe('2026-06-29')
  })
})

describe('decomposeForPackage', () => {
  let parserOpts: unknown
  beforeAll(async () => {
    const config = await createConfig()
    parserOpts = config.parserOpts
  })

  const packagePaths = {
    '@exodus/keychain': 'features/keychain',
    '@exodus/fusion': 'features/fusion',
    '@exodus/wallet': 'libraries/wallet',
  }

  const squash = { hash: 'f8f960b7d046018e', committerDate: '2026-06-29', gitTags: '' }

  // Mirrors the real PR #17038: a breaking keychain refactor plus downstream
  // commits, several of which touch other packages' files.
  const subCommits: CommitWithFiles[] = [
    {
      sha: 'a1',
      message:
        'refactor(keychain)!: replace addSeed/removeAllSeeds with unlock/lock\n\nBREAKING CHANGE: keychain.addSeed is renamed to keychain.unlock.',
      files: ['features/keychain/module/index.ts'],
    },
    {
      sha: 'a2',
      message: 'fix(wallet): adopt keychain unlock/lock rename',
      files: ['libraries/wallet/index.ts'],
    },
    {
      sha: 'a3',
      message: 'test: adopt keychain rename across consumer suites',
      files: ['features/fusion/src/__tests__/x.test.js'],
    },
    {
      sha: 'a4',
      message: 'refactor(fusion): type keychain.unlock as Promise<string>',
      files: ['features/fusion/src/declarations.d.ts'],
    },
  ]

  it('keeps a package to only the sub-commits whose files touch it', () => {
    const fusion = decomposeForPackage({
      squash,
      subCommits,
      packageName: '@exodus/fusion',
      packagePaths,
      parserOpts,
      prNumber: 17_038,
    })

    expect(fusion.map((c) => c.type)).toEqual(['test', 'refactor'])
  })

  it('does not leak a breaking note into a package the breaking commit never touched', () => {
    const fusion = decomposeForPackage({
      squash,
      subCommits,
      packageName: '@exodus/fusion',
      packagePaths,
      parserOpts,
      prNumber: 17_038,
    })

    expect(fusion.flatMap((c) => (c.notes ?? []) as Note[])).toHaveLength(0)
  })

  it('keeps the breaking note in the package whose files the breaking commit touched', () => {
    const keychain = decomposeForPackage({
      squash,
      subCommits,
      packageName: '@exodus/keychain',
      packagePaths,
      parserOpts,
      prNumber: 17_038,
    })

    expect(keychain).toHaveLength(1)
    expect(keychain[0]!.type).toBe('refactor')
    const notes = (keychain[0]!.notes ?? []) as Note[]
    expect(notes).toHaveLength(1)
    expect(notes[0]!.title).toMatch(/BREAKING/)
  })

  it('stamps the squash identity and appends the PR ref to the subject', () => {
    const wallet = decomposeForPackage({
      squash,
      subCommits,
      packageName: '@exodus/wallet',
      packagePaths,
      parserOpts,
      prNumber: 17_038,
    })

    expect(wallet).toHaveLength(1)
    expect(wallet[0]!.hash).toBe('f8f960b7d046018e')
    expect(wallet[0]!.committerDate).toBe('2026-06-29')
    expect(wallet[0]!.subject).toBe('adopt keychain unlock/lock rename (#17038)')
  })

  it('does not double-append a PR ref the author already wrote', () => {
    const out = decomposeForPackage({
      squash,
      subCommits: [
        {
          sha: 'b1',
          message: 'fix(fusion): keychain type (#17399)',
          files: ['features/fusion/src/types.ts'],
        },
      ],
      packageName: '@exodus/fusion',
      packagePaths,
      parserOpts,
      prNumber: 17_399,
    })

    expect(out[0]!.subject).toBe('keychain type (#17399)')
  })

  it('rebases repo-relative files into the working directory before attribution', () => {
    const out = decomposeForPackage({
      squash,
      subCommits: [
        { sha: 'c1', message: 'fix(fusion): x', files: ['sub/features/fusion/src/a.ts'] },
      ],
      packageName: '@exodus/fusion',
      packagePaths,
      parserOpts,
      prNumber: 1,
      repoRelativePrefix: 'sub',
    })

    expect(out).toHaveLength(1)
  })
})
