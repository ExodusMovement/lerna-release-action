import { Volume } from 'memfs/lib/volume'
import { createFsFromJSON } from '../utils/testing'
import { GithubClient } from '../utils/github'
import {
  buildPreviewRows,
  nextVersion,
  postVersionPreview,
  PREVIEW_MARKER,
  renderPreviewComment,
} from './preview'
import { BUMP_MAJOR, BUMP_MINOR, BUMP_PATCH } from './bumps'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}))

const repo = { owner: 'WayneFoundation', repo: 'batcave' }

const packagePaths = {
  '@exodus/atoms': 'libraries/atoms',
  '@exodus/balances': 'modules/balances',
}

function makeFs(versions: Record<string, string>): Volume {
  const tree: Record<string, string> = {}
  for (const [pkg, version] of Object.entries(versions)) {
    const dir = packagePaths[pkg as keyof typeof packagePaths]
    if (!dir) continue
    tree[`${dir}/package.json`] = JSON.stringify({ name: pkg, version })
  }

  return createFsFromJSON(tree)
}

describe('nextVersion', () => {
  it('bumps major', () => {
    expect(nextVersion('1.2.3', BUMP_MAJOR)).toBe('2.0.0')
  })

  it('bumps minor', () => {
    expect(nextVersion('1.2.3', BUMP_MINOR)).toBe('1.3.0')
  })

  it('bumps patch', () => {
    expect(nextVersion('1.2.3', BUMP_PATCH)).toBe('1.2.4')
  })

  it('releases a pre-release to its base version on a patch bump', () => {
    expect(nextVersion('1.2.3-rc.4', BUMP_PATCH)).toBe('1.2.3')
  })

  it('returns input when the version is unparseable', () => {
    expect(nextVersion('not-a-version', BUMP_MAJOR)).toBe('not-a-version')
  })
})

describe('buildPreviewRows', () => {
  it('reads current versions from package.json and computes next versions', () => {
    const fs = makeFs({ '@exodus/atoms': '1.0.0', '@exodus/balances': '2.5.0' })
    const rows = buildPreviewRows({
      bumps: { '@exodus/atoms': BUMP_MAJOR, '@exodus/balances': BUMP_PATCH },
      packagePaths,
      filesystem: fs as never,
    })
    expect(rows).toEqual([
      { pkg: '@exodus/atoms', bump: BUMP_MAJOR, current: '1.0.0', next: '2.0.0' },
      { pkg: '@exodus/balances', bump: BUMP_PATCH, current: '2.5.0', next: '2.5.1' },
    ])
  })

  it('skips packages whose package.json is missing', () => {
    const fs = makeFs({ '@exodus/atoms': '1.0.0' })
    const rows = buildPreviewRows({
      bumps: { '@exodus/atoms': BUMP_MAJOR, '@exodus/balances': BUMP_PATCH },
      packagePaths,
      filesystem: fs as never,
    })
    expect(rows).toEqual([
      { pkg: '@exodus/atoms', bump: BUMP_MAJOR, current: '1.0.0', next: '2.0.0' },
    ])
  })
})

describe('renderPreviewComment', () => {
  it('starts with the marker and includes the table', () => {
    const body = renderPreviewComment([
      { pkg: '@exodus/atoms', bump: BUMP_MAJOR, current: '1.0.0', next: '2.0.0' },
    ])
    expect(body.startsWith(PREVIEW_MARKER)).toBe(true)
    expect(body).toContain('| `@exodus/atoms` | major | 1.0.0 | 2.0.0 |')
  })
})

describe('postVersionPreview', () => {
  type ListComments = GithubClient['rest']['issues']['listComments']
  type Comment = { id: number; body: string }

  function makeClient(existing: Comment[] = []) {
    const paginate = jest.fn().mockResolvedValue(existing)
    const createComment = jest.fn().mockResolvedValue(undefined)
    const deleteComment = jest.fn().mockResolvedValue(undefined)
    const listComments = jest.fn() as unknown as ListComments
    const client = {
      paginate,
      rest: {
        issues: { listComments, createComment, deleteComment },
      },
    } as unknown as GithubClient
    return { client, paginate, createComment, deleteComment }
  }

  it('posts a fresh comment when there are bumps and no prior comment', async () => {
    const { client, createComment, deleteComment } = makeClient()
    const filesystem = makeFs({ '@exodus/atoms': '1.0.0' })

    await postVersionPreview({
      client,
      repo,
      prNumber: 42,
      bumps: { '@exodus/atoms': BUMP_MAJOR },
      packagePaths,
      filesystem: filesystem as never,
    })

    expect(deleteComment).not.toHaveBeenCalled()
    expect(createComment).toHaveBeenCalledTimes(1)
    const [args] = createComment.mock.calls[0]
    expect(args.issue_number).toBe(42)
    expect(args.body).toContain(PREVIEW_MARKER)
    expect(args.body).toContain('@exodus/atoms')
    expect(args.body).toContain('2.0.0')
  })

  it('deletes every stale preview comment before posting the new one', async () => {
    const { client, createComment, deleteComment } = makeClient([
      { id: 111, body: `${PREVIEW_MARKER}\nstale one` },
      { id: 222, body: 'unrelated reviewer comment' },
      { id: 333, body: `${PREVIEW_MARKER}\nstale two` },
    ])
    const filesystem = makeFs({ '@exodus/atoms': '1.0.0' })

    await postVersionPreview({
      client,
      repo,
      prNumber: 42,
      bumps: { '@exodus/atoms': BUMP_MAJOR },
      packagePaths,
      filesystem: filesystem as never,
    })

    expect(deleteComment).toHaveBeenCalledTimes(2)
    expect(deleteComment).toHaveBeenCalledWith({ ...repo, comment_id: 111 })
    expect(deleteComment).toHaveBeenCalledWith({ ...repo, comment_id: 333 })
    expect(deleteComment).not.toHaveBeenCalledWith({ ...repo, comment_id: 222 })
    expect(createComment).toHaveBeenCalledTimes(1)
  })

  it('clears stale comments and posts nothing when the bumps map is empty', async () => {
    const { client, createComment, deleteComment } = makeClient([
      { id: 333, body: `${PREVIEW_MARKER}\nstale preview` },
    ])

    await postVersionPreview({
      client,
      repo,
      prNumber: 42,
      bumps: {},
      packagePaths,
      filesystem: makeFs({}) as never,
    })

    expect(deleteComment).toHaveBeenCalledWith({ ...repo, comment_id: 333 })
    expect(createComment).not.toHaveBeenCalled()
  })

  it('is a no-op when there are no bumps and no stale comment', async () => {
    const { client, createComment, deleteComment } = makeClient([])

    await postVersionPreview({
      client,
      repo,
      prNumber: 42,
      bumps: {},
      packagePaths,
      filesystem: makeFs({}) as never,
    })

    expect(deleteComment).not.toHaveBeenCalled()
    expect(createComment).not.toHaveBeenCalled()
  })
})
