import { createSignedCommit, GithubClient } from './github'
import { readFile } from 'node:fs/promises'

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}))

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
}))

describe('createSignedCommit', () => {
  const repo = { owner: 'WayneFoundation', repo: 'batcave' }

  let client: GithubClient
  let createRef: jest.Mock
  let graphql: jest.Mock

  beforeEach(() => {
    createRef = jest.fn()
    graphql = jest.fn().mockResolvedValue({
      createCommitOnBranch: { commit: { oid: 'signed-oid' } },
    })

    client = {
      rest: { git: { createRef } },
      graphql,
    } as unknown as GithubClient

    // `createSignedCommit` reads with `{ encoding: 'base64' }`, so readFile resolves a base64 string.
    jest
      .mocked(readFile)
      .mockImplementation(async (path) =>
        Buffer.from(`contents of ${path as string}`).toString('base64')
      )
  })

  it('creates the branch ref then commits base64 file contents, returning the new oid', async () => {
    const oid = await createSignedCommit({
      client,
      repo,
      branch: 'ci/release/123',
      expectedHeadOid: 'base-sha',
      headline: 'chore(release): publish',
      body: 'tag-a\ntag-b',
      additions: ['a/package.json', 'b/CHANGELOG.md'],
    })

    expect(createRef).toHaveBeenCalledWith({
      owner: 'WayneFoundation',
      repo: 'batcave',
      ref: 'refs/heads/ci/release/123',
      sha: 'base-sha',
    })

    expect(graphql).toHaveBeenCalledTimes(1)
    const [, variables] = graphql.mock.calls[0]
    expect(variables.input).toEqual({
      branch: {
        repositoryNameWithOwner: 'WayneFoundation/batcave',
        branchName: 'ci/release/123',
      },
      message: { headline: 'chore(release): publish', body: 'tag-a\ntag-b' },
      expectedHeadOid: 'base-sha',
      fileChanges: {
        additions: [
          {
            path: 'a/package.json',
            contents: Buffer.from('contents of a/package.json').toString('base64'),
          },
          {
            path: 'b/CHANGELOG.md',
            contents: Buffer.from('contents of b/CHANGELOG.md').toString('base64'),
          },
        ],
      },
    })

    expect(oid).toBe('signed-oid')
  })
})
