import { computeBumpsForPr } from './commit-driven-version-dispatch'
import { BUMP_MAJOR, BUMP_MINOR, BUMP_PATCH } from './commit-driven-version-dispatch/bumps'

type FakeCommit = { sha: string; commit: { message: string } }
type FakeFile = { filename: string }

function buildClient(commits: FakeCommit[], filesBySha: Record<string, FakeFile[]>) {
  return {
    paginate: async () => commits,
    rest: {
      pulls: { listCommits: () => {} },
      repos: {
        getCommit: async ({ ref }: { ref: string }) => ({
          data: { files: filesBySha[ref] ?? [] },
        }),
      },
    },
  } as never
}

const packagePaths = {
  '@scope/a': 'features/a',
  '@scope/b': 'features/b',
}

describe('computeBumpsForPr', () => {
  test('attributes commits per-package and takes max bump', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'feat(a)!: drop legacy' } },
      { sha: 'bbb2222', commit: { message: 'fix(a): nil check' } },
      { sha: 'ccc3333', commit: { message: 'feat(b): new helper' } },
      { sha: 'ddd4444', commit: { message: 'refactor(a): rename var' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/src/index.ts' }],
      bbb2222: [{ filename: 'features/a/src/util.ts' }],
      ccc3333: [{ filename: 'features/b/helper.ts' }],
      ddd4444: [{ filename: 'features/a/src/index.ts' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: '',
    })
    expect(bumps).toEqual({ '@scope/a': BUMP_MAJOR, '@scope/b': BUMP_MINOR })
  })

  test('cross-touching commit attributes its bump to every package', async () => {
    const commits = [{ sha: 'aaa1111', commit: { message: 'feat(shared)!: refactor' } }]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/src/index.ts' }, { filename: 'features/b/index.ts' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: '',
    })
    expect(bumps).toEqual({ '@scope/a': BUMP_MAJOR, '@scope/b': BUMP_MAJOR })
  })

  test('commits with no workspace files are ignored', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'feat: docs' } },
      { sha: 'bbb2222', commit: { message: 'chore: bump deps' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'README.md' }],
      bbb2222: [{ filename: 'package.json' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: '',
    })
    expect(bumps).toEqual({})
  })

  test('non-bumping types do not enter the map even when files are touched', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'refactor(a): rename' } },
      { sha: 'bbb2222', commit: { message: 'docs(a): readme' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/x.ts' }],
      bbb2222: [{ filename: 'features/a/README.md' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: '',
    })
    expect(bumps).toEqual({})
  })

  test('falls back to PR title when every commit is non-bumping', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'refactor(a): migrate to TS' } },
      { sha: 'bbb2222', commit: { message: 'chore: lockfile' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/src/index.ts' }],
      bbb2222: [{ filename: 'features/a/yarn.lock' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: 'feat(a)!: migrate to TS and drop /src subpath',
    })
    expect(bumps).toEqual({ '@scope/a': BUMP_MAJOR })
  })

  test('fallback applies title bump to every workspace touched by the PR', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'refactor: migrate' } },
      { sha: 'bbb2222', commit: { message: 'chore: lockfile' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/x.ts' }, { filename: 'features/b/y.ts' }],
      bbb2222: [{ filename: 'package.json' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: 'feat!: cross-cutting refactor',
    })
    expect(bumps).toEqual({ '@scope/a': BUMP_MAJOR, '@scope/b': BUMP_MAJOR })
  })

  test('per-commit signal wins; fallback does NOT run when at least one commit bumps', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'feat(a)!: scoped break' } },
      { sha: 'bbb2222', commit: { message: 'refactor(b): polish' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/index.ts' }],
      bbb2222: [{ filename: 'features/b/index.ts' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: 'feat!: would apply major to all if fallback ran',
    })
    expect(bumps).toEqual({ '@scope/a': BUMP_MAJOR })
  })

  test('fallback yields empty when PR title also carries no bump', async () => {
    const commits = [{ sha: 'aaa1111', commit: { message: 'chore: lockfile' } }]
    const filesBySha = { aaa1111: [{ filename: 'features/a/x.ts' }] }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: 'chore: misc cleanup',
    })
    expect(bumps).toEqual({})
  })

  test('regression: patch + fix combine to patch (not minor)', async () => {
    const commits = [
      { sha: 'aaa1111', commit: { message: 'fix(a): one' } },
      { sha: 'bbb2222', commit: { message: 'perf(a): two' } },
    ]
    const filesBySha = {
      aaa1111: [{ filename: 'features/a/x.ts' }],
      bbb2222: [{ filename: 'features/a/y.ts' }],
    }
    const bumps = await computeBumpsForPr({
      client: buildClient(commits, filesBySha),
      repo: { owner: 'o', repo: 'r' },
      prNumber: 1,
      packagePaths,
      prTitle: '',
    })
    expect(bumps).toEqual({ '@scope/a': BUMP_PATCH })
  })
})
