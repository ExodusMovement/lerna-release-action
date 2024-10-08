import * as github from '@actions/github'
import { GithubClient } from './utils/github'
import { publish } from './publish'
import { execFileSync } from 'node:child_process'
import * as core from '@actions/core'
import { when } from 'jest-when'

jest.mock('node:child_process', () => ({
  execFileSync: jest.fn(() => ''),
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
}))

describe('publish', () => {
  const repo = {
    owner: 'WayneFoundation',
    repo: 'batcave',
  }

  let client: GithubClient

  beforeAll(() => {
    Object.defineProperty(github, 'getOctokit', {
      value: () => client,
    })
  })

  beforeEach(() => {
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
        eventName: 'pull_request',
        payload: {
          pull_request: {
            merged: true,
            merge_commit_sha: 'abc123',
            labels: [{ name: 'publish-on-merge' }, { name: 'docs' }],
            base: {
              ref: 'master',
            },
          },
        },
        sha: 'abc123',
      },
    })
  })

  test('aborts when no new packages', async () => {
    await publish()

    expect(execFileSync).toHaveBeenCalledWith(
      'npx',
      ['lerna', 'publish', 'from-package', '--yes', '--no-private'],
      { encoding: 'utf8' }
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

    expect(execFileSync).not.toHaveBeenCalled()
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

    expect(execFileSync).toHaveBeenCalledWith(
      'npx',
      ['lerna', 'publish', 'from-package', '--yes', '--no-private'],
      { encoding: 'utf8' }
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

    expect(execFileSync).toHaveBeenCalledWith(
      'npx',
      ['lerna', 'publish', 'from-package', '--yes', '--no-private'],
      { encoding: 'utf8' }
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

    expect(execFileSync).not.toHaveBeenCalled()
  })
})
