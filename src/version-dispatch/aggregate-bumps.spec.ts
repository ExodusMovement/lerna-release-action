import { aggregateBumps } from '../version-dispatch'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  notice: jest.fn(),
  debug: jest.fn(),
}))

const packagePaths = {
  '@exodus/atoms': 'libraries/atoms',
  '@exodus/balances': 'modules/balances',
  '@exodus/wallet': 'libraries/wallet',
}

describe('aggregateBumps', () => {
  it('returns the max bump per package across attributed commits', () => {
    const bumps = aggregateBumps({
      commits: [
        {
          sha: 'aaa1111',
          message: 'feat(atoms): minor stuff',
          files: ['libraries/atoms/index.ts'],
        },
        {
          sha: 'bbb2222',
          message: 'feat(atoms)!: drop legacy',
          files: ['libraries/atoms/legacy.ts'],
        },
        {
          sha: 'ccc3333',
          message: 'fix(balances): tidy',
          files: ['modules/balances/x.ts'],
        },
      ],
      packagePaths,
      prTitle: 'feat: cool stuff',
    })
    expect(bumps).toEqual({ '@exodus/atoms': 'major', '@exodus/balances': 'patch' })
  })

  it('omits packages that received no bump', () => {
    const bumps = aggregateBumps({
      commits: [
        {
          sha: 'aaa1111',
          message: 'refactor(atoms): rename',
          files: ['libraries/atoms/index.ts'],
        },
        {
          sha: 'bbb2222',
          message: 'fix(balances): tidy',
          files: ['modules/balances/x.ts'],
        },
      ],
      packagePaths,
      prTitle: 'feat: combined',
    })
    expect(bumps).toEqual({ '@exodus/balances': 'patch' })
  })

  it('skips bumping commits that touch no workspace files', () => {
    const bumps = aggregateBumps({
      commits: [{ sha: 'aaa1111', message: 'feat!: docs only', files: ['README.md'] }],
      packagePaths,
      prTitle: 'feat: doc-only',
    })
    expect(bumps).toEqual({})
  })

  it('falls back to the PR title when no commit carries a bump', () => {
    const bumps = aggregateBumps({
      commits: [
        {
          sha: 'aaa1111',
          message: 'refactor(atoms): migrate',
          files: ['libraries/atoms/x.ts'],
        },
        {
          sha: 'bbb2222',
          message: 'chore: lockfile',
          files: ['libraries/atoms/yarn.lock'],
        },
      ],
      packagePaths,
      prTitle: 'feat(atoms)!: title-fallback test',
    })
    expect(bumps).toEqual({ '@exodus/atoms': 'major' })
  })

  it('returns an empty map when neither commits nor title carry a bump', () => {
    const bumps = aggregateBumps({
      commits: [
        {
          sha: 'aaa1111',
          message: 'chore: lockfile',
          files: ['libraries/atoms/x.ts'],
        },
      ],
      packagePaths,
      prTitle: 'chore: cleanup',
    })
    expect(bumps).toEqual({})
  })
})
