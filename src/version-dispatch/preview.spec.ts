import { Volume } from 'memfs/lib/volume'
import { createFsFromJSON } from '../utils/testing'
import { GithubClient } from '../utils/github'
import {
  applyPreviewBlock,
  buildPreviewRows,
  nextVersion,
  PREVIEW_MARKER_END,
  PREVIEW_MARKER_START,
  renderPreviewBlock,
  updateVersionPreview,
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

  it('strips pre-release metadata for the math', () => {
    expect(nextVersion('1.2.3-rc.4', BUMP_PATCH)).toBe('1.2.4')
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

describe('renderPreviewBlock', () => {
  it('wraps the table in the paired markers', () => {
    const block = renderPreviewBlock([
      { pkg: '@exodus/atoms', bump: BUMP_MAJOR, current: '1.0.0', next: '2.0.0' },
    ])
    expect(block.startsWith(PREVIEW_MARKER_START)).toBe(true)
    expect(block.endsWith(PREVIEW_MARKER_END)).toBe(true)
    expect(block).toContain('| `@exodus/atoms` | major | 1.0.0 | 2.0.0 |')
  })
})

describe('applyPreviewBlock', () => {
  const block = renderPreviewBlock([
    { pkg: '@exodus/atoms', bump: BUMP_MAJOR, current: '1.0.0', next: '2.0.0' },
  ])

  it('appends the block to an empty body', () => {
    expect(applyPreviewBlock('', block)).toBe(block)
  })

  it('appends the block to a body with no prior preview', () => {
    const body = '## Summary\n\nDoes a thing.'
    const result = applyPreviewBlock(body, block)
    expect(result).toBe(`${body}\n\n${block}`)
  })

  it('replaces an existing block in place', () => {
    const stale = renderPreviewBlock([
      { pkg: '@exodus/atoms', bump: BUMP_PATCH, current: '0.9.0', next: '0.9.1' },
    ])
    const body = `## Summary\n\nDoes a thing.\n\n${stale}`
    const result = applyPreviewBlock(body, block)
    expect(result).toBe(`## Summary\n\nDoes a thing.\n\n${block}`)
    expect(result).not.toContain('0.9.0')
  })

  it('strips a stale block and leaves the body untouched when there is nothing to render', () => {
    const stale = renderPreviewBlock([
      { pkg: '@exodus/atoms', bump: BUMP_PATCH, current: '0.9.0', next: '0.9.1' },
    ])
    const body = `## Summary\n\nDoes a thing.\n\n${stale}`
    const result = applyPreviewBlock(body, '')
    expect(result).toBe('## Summary\n\nDoes a thing.')
    expect(result).not.toContain('preview')
  })
})

describe('updateVersionPreview', () => {
  type PullsUpdate = GithubClient['rest']['pulls']['update']

  function makeClient() {
    const update = jest.fn().mockResolvedValue(undefined) as unknown as PullsUpdate
    const client = {
      rest: { pulls: { update } },
    } as unknown as GithubClient
    return { client, update: update as unknown as jest.Mock }
  }

  it('appends a preview block when none exists yet', async () => {
    const { client, update } = makeClient()
    const filesystem = makeFs({ '@exodus/atoms': '1.0.0' })

    await updateVersionPreview({
      client,
      repo,
      prNumber: 42,
      prBody: '## Summary\n\nDoes a thing.',
      bumps: { '@exodus/atoms': BUMP_MAJOR },
      packagePaths,
      filesystem: filesystem as never,
    })

    expect(update).toHaveBeenCalledTimes(1)
    const [args] = update.mock.calls[0]
    expect(args.pull_number).toBe(42)
    expect(args.body).toContain('## Summary')
    expect(args.body).toContain(PREVIEW_MARKER_START)
    expect(args.body).toContain('2.0.0')
  })

  it('replaces a stale preview block in place', async () => {
    const { client, update } = makeClient()
    const filesystem = makeFs({ '@exodus/atoms': '1.0.0' })
    const staleBlock = renderPreviewBlock([
      { pkg: '@exodus/atoms', bump: BUMP_PATCH, current: '0.5.0', next: '0.5.1' },
    ])
    const body = `## Summary\n\nDoes a thing.\n\n${staleBlock}`

    await updateVersionPreview({
      client,
      repo,
      prNumber: 42,
      prBody: body,
      bumps: { '@exodus/atoms': BUMP_MAJOR },
      packagePaths,
      filesystem: filesystem as never,
    })

    const [args] = update.mock.calls[0]
    expect(args.body).toContain('2.0.0')
    expect(args.body).not.toContain('0.5.0')
    expect(args.body.match(new RegExp(PREVIEW_MARKER_START, 'g'))!.length).toBe(1)
  })

  it('strips a stale block when the bumps map becomes empty', async () => {
    const { client, update } = makeClient()
    const staleBlock = renderPreviewBlock([
      { pkg: '@exodus/atoms', bump: BUMP_PATCH, current: '0.5.0', next: '0.5.1' },
    ])
    const body = `## Summary\n\nDoes a thing.\n\n${staleBlock}`

    await updateVersionPreview({
      client,
      repo,
      prNumber: 42,
      prBody: body,
      bumps: {},
      packagePaths,
      filesystem: makeFs({}) as never,
    })

    const [args] = update.mock.calls[0]
    expect(args.body).toBe('## Summary\n\nDoes a thing.')
  })

  it('is a no-op when there is no block to write and none to clean up', async () => {
    const { client, update } = makeClient()

    await updateVersionPreview({
      client,
      repo,
      prNumber: 42,
      prBody: '## Summary\n\nDoes a thing.',
      bumps: {},
      packagePaths,
      filesystem: makeFs({}) as never,
    })

    expect(update).not.toHaveBeenCalled()
  })

  it('handles a null body by writing only the preview block', async () => {
    const { client, update } = makeClient()
    const filesystem = makeFs({ '@exodus/atoms': '1.0.0' })

    await updateVersionPreview({
      client,
      repo,
      prNumber: 42,
      prBody: null,
      bumps: { '@exodus/atoms': BUMP_MAJOR },
      packagePaths,
      filesystem: filesystem as never,
    })

    const [args] = update.mock.calls[0]
    expect(args.body.startsWith(PREVIEW_MARKER_START)).toBe(true)
  })
})
