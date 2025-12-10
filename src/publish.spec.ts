import * as github from '@actions/github'
import { createTags, getReleasePr, GithubClient } from './utils/github'
import { publish } from './publish'
import { spawnSync } from 'node:child_process'
import * as core from '@actions/core'
import { when } from 'jest-when'
import { checkoutPr } from './utils/git'
import { extractTags } from './publish/extract-tags'

jest.mock('node:child_process', () => ({
  spawnSync: jest.fn(() => ({ stdout: '', status: 0 })),
}))

jest.mock('./utils/github', () => ({
  createTags: jest.fn(),
  getReleasePr: jest.fn(),
}))

jest.mock('./utils/git', () => ({
  checkoutPr: jest.fn(),
}))

jest.mock('./publish/extract-tags', () => ({
  extractTags: jest.fn().mockReturnValue([]),
}))

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  getMultilineInput: jest.fn(() => []),
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  notice: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
}))

describe('publish', () => {
  const repo = {
    owner: 'WayneFoundation',
    repo: 'batcave',
  }

  const commitSha = 'abc123'

  let client: GithubClient

  beforeAll(() => {
    Object.defineProperty(github, 'getOctokit', {
      value: () => client,
    })
  })

  beforeEach(() => {
    when(getReleasePr)
      .calledWith(
        expect.objectContaining({
          sha: commitSha,
        })
      )
      .mockResolvedValue({
        base: {
          ref: 'master',
        },
      } as never)

    client = {
      rest: {
        repos: {
          getBranchRules: jest.fn(),
        } as unknown,
      },
    } as GithubClient

    Object.defineProperty(github, 'context', {
      value: {
        repo,
        eventName: 'push',
        payload: {},
        sha: commitSha,
      },
    })

    jest.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    } as never)
  })

  test('aborts when no pull request found for push event', async () => {
    jest.mocked(getReleasePr).mockResolvedValue(undefined)
    await publish()

    expect(spawnSync).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/skipping/i))
  })

  test('aborts when no new packages', async () => {
    await publish()

    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      ['lerna', 'publish', 'from-package', '--yes', '--no-private', '--summary-file'],
      expect.objectContaining({ encoding: 'utf8' })
    )
    expect(core.notice).toHaveBeenCalledWith(expect.stringMatching(/aborted/))
  })

  test('does not publish if required ruleset is missing', async () => {
    when(client.rest.repos.getBranchRules)
      .calledWith({
        ...repo,
        branch: 'master',
      })
      .mockResolvedValue({
        data: [{ ruleset_id: 42 }],
      } as any)

    when(core.getMultilineInput)
      .calledWith('required-branch-rulesets')
      .mockReturnValue(['42', '73'])

    await publish()

    expect(spawnSync).not.toHaveBeenCalled()
  })

  test('publishes if all rulesets are applied', async () => {
    when(client.rest.repos.getBranchRules)
      .calledWith({
        ...repo,
        branch: 'master',
      })
      .mockResolvedValue({
        data: [{ ruleset_id: 42 }, { ruleset_id: 73 }],
      } as any)

    when(core.getMultilineInput)
      .calledWith('required-branch-rulesets')
      .mockReturnValue(['42', '73'])

    await publish()

    expect(checkoutPr).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        pr: {
          base: expect.objectContaining({
            ref: 'master',
          }),
        },
      })
    )

    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      ['lerna', 'publish', 'from-package', '--yes', '--no-private', '--summary-file'],
      expect.objectContaining({ encoding: 'utf8' })
    )
  })

  test('sets action to failed and applies partial tags on failed publish', async () => {
    when(client.rest.repos.getBranchRules)
      .calledWith({
        ...repo,
        branch: 'master',
      })
      .mockResolvedValue({
        data: [{ ruleset_id: 42 }, { ruleset_id: 73 }],
      } as any)

    when(core.getMultilineInput)
      .calledWith('required-branch-rulesets')
      .mockReturnValue(['42', '73'])

    jest.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 4,
    } as never)

    jest.mocked(extractTags).mockReturnValue(['@exodus/pay-schemas@2.8.0'])

    await publish()

    expect(core.setFailed).toHaveBeenCalled()
    expect(createTags).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ['@exodus/pay-schemas@2.8.0'],
      })
    )
  })

  test('publishes if all rulesets are applied when triggered through workflow dispatch', async () => {
    Object.defineProperty(github, 'context', {
      value: {
        ref: 'refs/heads/wallet-accounts/10.x',
        repo,
        eventName: 'workflow_dispatch',
        payload: {},
        sha: 'abc123',
      },
    })

    when(client.rest.repos.getBranchRules)
      .calledWith({
        ...repo,
        branch: 'wallet-accounts/10.x',
      })
      .mockResolvedValue({
        data: [{ ruleset_id: 42 }, { ruleset_id: 73 }],
      } as any)

    when(core.getMultilineInput)
      .calledWith('required-branch-rulesets')
      .mockReturnValue(['42', '73'])

    await publish()

    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      ['lerna', 'publish', 'from-package', '--yes', '--no-private', '--summary-file'],
      expect.objectContaining({ encoding: 'utf8' })
    )
  })

  test('does not publish if required ruleset is missing when triggerd by workflow dispatch', async () => {
    Object.defineProperty(github, 'context', {
      value: {
        ref: 'refs/heads/wallet-accounts/10.x',
        repo,
        eventName: 'workflow_dispatch',
        payload: {},
        sha: 'abc123',
      },
    })

    when(client.rest.repos.getBranchRules)
      .calledWith({
        ...repo,
        branch: 'wallet-accounts/10.x',
      })
      .mockResolvedValue({
        data: [{ ruleset_id: 42 }],
      } as any)

    when(core.getMultilineInput)
      .calledWith('required-branch-rulesets')
      .mockReturnValue(['42', '73'])

    await publish()

    expect(spawnSync).not.toHaveBeenCalled()
  })
})
