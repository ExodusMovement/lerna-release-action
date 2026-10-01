import * as github from '@actions/github'
import * as core from '@actions/core'
import { when } from 'jest-when'
import { getReleasePr, GithubClient } from './utils/github'
import { releaseRef } from './release-ref'

jest.mock('./utils/github', () => ({
  getReleasePr: jest.fn(),
}))

jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
}))

describe('releaseRef', () => {
  const repo = {
    owner: 'WayneFoundation',
    repo: 'batcave',
  }

  const pushSha = 'merge-sha'
  const client = {} as GithubClient

  beforeAll(() => {
    Object.defineProperty(github, 'getOctokit', {
      value: () => client,
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getReleasePr).mockResolvedValue(undefined)
  })

  function setContext(eventName: string) {
    Object.defineProperty(github, 'context', {
      value: { repo, eventName, payload: {}, sha: pushSha },
    })
  }

  test('outputs the release PR head for a pushed release commit', async () => {
    setContext('push')
    when(getReleasePr)
      .calledWith({ client, repo, sha: pushSha })
      .mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/WayneFoundation/batcave/pull/42',
        head: { sha: 'pr-head-sha' },
      } as never)

    await releaseRef()

    expect(core.setOutput).toHaveBeenCalledWith('sha', 'pr-head-sha')
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', '42')
  })

  test('outputs the pushed sha when the push is not a release commit', async () => {
    setContext('push')

    await releaseRef()

    expect(core.setOutput).toHaveBeenCalledWith('sha', pushSha)
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', '')
  })

  test('outputs the triggering sha on workflow_dispatch without a lookup', async () => {
    setContext('workflow_dispatch')

    await releaseRef()

    expect(getReleasePr).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('sha', pushSha)
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', '')
  })
})
