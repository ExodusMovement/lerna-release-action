import { isPackageReleased } from './released'
import { GithubClient } from '../utils/github'

jest.mock('@actions/core', () => ({
  warning: jest.fn(),
}))

const repo = { owner: 'WayneFoundation', repo: 'batcave' }

function makeClient(impl: (params: { ref: string }) => Promise<{ data: unknown[] }>) {
  const listMatchingRefs = jest.fn(impl)
  const client = {
    rest: { git: { listMatchingRefs } },
  } as unknown as GithubClient
  return { client, listMatchingRefs }
}

describe('isPackageReleased', () => {
  it('queries tags by the `<pkg>@` prefix and reports released when a tag exists', async () => {
    const { client, listMatchingRefs } = makeClient(async () => ({
      data: [{ ref: 'refs/tags/@exodus/atoms@1.2.3' }],
    }))

    const released = await isPackageReleased({ client, repo, name: '@exodus/atoms' })

    expect(released).toBe(true)
    expect(listMatchingRefs).toHaveBeenCalledWith({
      ...repo,
      ref: 'tags/@exodus/atoms@',
      per_page: 1,
    })
  })

  it('reports not-released when no matching tag exists', async () => {
    const { client } = makeClient(async () => ({ data: [] }))
    expect(await isPackageReleased({ client, repo, name: '@exodus/atoms' })).toBe(false)
  })

  it('assumes released when the API call fails (fail-safe)', async () => {
    const { client } = makeClient(async () => {
      throw new Error('rate limited')
    })
    expect(await isPackageReleased({ client, repo, name: '@exodus/atoms' })).toBe(true)
  })
})
