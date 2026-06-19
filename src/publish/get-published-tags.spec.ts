import * as fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { getPublishedTags } from './get-published-tags'
import { GithubClient } from '../utils/github'

jest.mock('node:fs', () => ({ readFileSync: jest.fn() }))
jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }))

const repo = { owner: 'WayneFoundation', repo: 'batcave' }

const manifests: Record<string, unknown> = {
  'packages/safe-string/package.json': { name: '@exodus/safe-string', version: '1.4.1' },
  'packages/errors/package.json': { name: '@exodus/errors', version: '3.7.1' },
  // new package that failed to publish — exists on disk but not on npm
  'packages/token-delegation/package.json': { name: '@exodus/token-delegation', version: '1.0.0' },
  // private package — never published, must be skipped without an npm lookup
  'packages/secret/package.json': { name: '@exodus/secret', version: '2.0.0', private: true },
}

const published = new Set(['@exodus/safe-string@1.4.1', '@exodus/errors@3.7.1'])

beforeEach(() => {
  jest.mocked(fs.readFileSync).mockImplementation((path) => {
    const content = manifests[path as string]
    if (!content) throw new Error('ENOENT')
    return JSON.stringify(content)
  })

  jest.mocked(spawnSync).mockImplementation((_cmd, args) => {
    const [, spec = ''] = args as string[] // `npm view <name@version> version`
    return published.has(spec)
      ? ({ status: 0, stdout: `${spec.split('@').pop()}\n`, stderr: '' } as never)
      : ({ status: 1, stdout: '', stderr: 'npm error 404' } as never)
  })
})

function makeClient(filenames: string[]): GithubClient {
  return {
    paginate: jest.fn().mockResolvedValue(filenames.map((filename) => ({ filename }))),
    rest: { pulls: { listFiles: jest.fn() } },
  } as unknown as GithubClient
}

test('tags only non-private packages whose version is live on npm', async () => {
  const client = makeClient([
    'packages/safe-string/package.json',
    'packages/safe-string/CHANGELOG.md', // non-manifest, ignored
    'packages/errors/package.json',
    'packages/token-delegation/package.json', // not on npm, excluded
    'packages/secret/package.json', // private, excluded
  ])

  const tags = await getPublishedTags({ client, repo, prNumber: 42 })

  expect(tags).toEqual(['@exodus/safe-string@1.4.1', '@exodus/errors@3.7.1'])
  // private package is filtered before any npm lookup
  expect(spawnSync).not.toHaveBeenCalledWith(
    'npm',
    ['view', '@exodus/secret@2.0.0', 'version'],
    expect.anything()
  )
})
