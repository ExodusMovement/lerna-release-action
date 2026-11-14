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

// How octokit reports undici's `SocketError: other side closed`
const socketClosed = () => Object.assign(new Error('other side closed'), { status: 500 })

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

  it('reads addition contents from repoRoot while keeping API paths repo-root-relative', async () => {
    await createSignedCommit({
      client,
      repo,
      branch: 'ci/release/123',
      expectedHeadOid: 'base-sha',
      headline: 'chore(release): publish',
      additions: ['apps/mobile/a/package.json'],
      repoRoot: '/checkout',
    })

    expect(readFile).toHaveBeenCalledWith('/checkout/apps/mobile/a/package.json', {
      encoding: 'base64',
    })

    const [, variables] = graphql.mock.calls[0]
    expect(variables.input.fileChanges.additions).toEqual([
      {
        path: 'apps/mobile/a/package.json',
        contents: Buffer.from('contents of /checkout/apps/mobile/a/package.json').toString(
          'base64'
        ),
      },
    ])
  })

  describe('when a request fails', () => {
    const params = {
      repo,
      branch: 'ci/release/123',
      expectedHeadOid: 'base-sha',
      headline: 'chore(release): publish',
      additions: ['a/package.json'],
    }

    it('retries the ref and the commit after GitHub closed the idle socket', async () => {
      createRef.mockRejectedValueOnce(socketClosed())
      graphql.mockRejectedValueOnce(socketClosed())

      await expect(createSignedCommit({ client, ...params })).resolves.toBe('signed-oid')

      expect(createRef).toHaveBeenCalledTimes(2)
      expect(graphql).toHaveBeenCalledTimes(2)
    })

    it('treats a ref created by the failed attempt as success', async () => {
      createRef
        .mockRejectedValueOnce(socketClosed())
        .mockRejectedValueOnce(
          Object.assign(new Error('Reference already exists'), { status: 422 })
        )

      await expect(createSignedCommit({ client, ...params })).resolves.toBe('signed-oid')

      expect(createRef).toHaveBeenCalledTimes(2)
      expect(graphql).toHaveBeenCalledTimes(1)
    })

    it('gives up immediately on a permanent failure', async () => {
      createRef.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))

      await expect(createSignedCommit({ client, ...params })).rejects.toThrow('Not Found')

      expect(createRef).toHaveBeenCalledTimes(1)
      expect(graphql).not.toHaveBeenCalled()
    })
  })
})
