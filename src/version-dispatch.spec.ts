import * as github from '@actions/github'
import { versionDispatch } from './version-dispatch'
import { GithubClient } from './utils/github'
import { Volume } from 'memfs/lib/volume'

jest.mock('@actions/core', () => ({
  getInput: (name: string) => {
    const inputs: Record<string, unknown> = {
      ref: 'main',
      'version-workflow-id': 'a tiny little workflow',
      'github-token': 'abc',
    }
    return inputs[name]
  },
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  notice: jest.fn(),
  setFailed: jest.fn(),
}))

describe('versionDispatch', () => {
  type CreateWorkflowDispatch = GithubClient['rest']['actions']['createWorkflowDispatch']

  const repo = {
    owner: 'WayneFoundation',
    repo: 'batcave',
  }

  const workflowId = 'a tiny little workflow'
  const ref = 'main'

  const lernaConfig = JSON.stringify({
    packages: ['libraries/*', 'modules/*'],
  })

  let client: GithubClient
  let fs: Volume

  beforeAll(() => {
    Object.defineProperty(github, 'getOctokit', {
      value: () => client,
    })
  })

  beforeEach(() => {
    client = {
      rest: {
        actions: {
          createWorkflowDispatch: jest.fn() as unknown as CreateWorkflowDispatch,
        },
      },
    } as GithubClient

    Object.defineProperty(github.context, 'repo', {
      value: repo,
    })

    fs = Volume.fromJSON({
      'lerna.json': lernaConfig,
      'libraries/atoms/package.json': JSON.stringify({ name: '@exodus/atoms' }),
      'modules/blockchain-metadata/package.json': JSON.stringify({
        name: '@exodus/blockchain-metadata',
      }),
    })
  })

  it('should invoke version workflow with packages affected by PR', async () => {
    github.context.payload = {
      pull_request: {
        number: 123,
        merged: true,
        user: {
          login: 'brucewayne',
        },
        labels: [{ name: 'blockchain-metadata' }, { name: 'atoms' }, { name: 'refactor' }],
      },
    }

    await versionDispatch({ filesystem: fs as never })

    expect(client.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      ...repo,
      ref,
      workflow_id: workflowId,
      inputs: {
        assignee: 'brucewayne',
        'version-strategy': 'conventional-commits',
        packages: 'libraries/atoms,modules/blockchain-metadata',
      },
    })
  })

  it('should abort for non-PR event', async () => {
    github.context.payload = {
      comment: {
        id: 1,
      },
    }

    await versionDispatch({ filesystem: fs as never })
    expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
  })

  it('should abort if PR was not merged', async () => {
    github.context.payload = {
      pull_request: {
        number: 123,
        merged: false,
        labels: [{ name: 'blockchain-metadata' }, { name: 'atoms' }, { name: 'refactor' }],
      },
    }

    await versionDispatch({ filesystem: fs as never })
    expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
  })

  it('should abort if none of the lerna managed packages were affected', async () => {
    github.context.payload = {
      pull_request: {
        number: 123,
        merged: true,
        labels: [{ name: 'ci' }, { name: 'docs' }],
      },
    }

    await versionDispatch({ filesystem: fs as never })
    expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
  })
})
