import * as github from '@actions/github'
import { versionDispatch } from './version-dispatch'
import { GithubClient } from './utils/github'
import { Volume } from 'memfs/lib/volume'

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

    process.env['INPUT_GITHUB-TOKEN'] = 'the token'
    process.env['INPUT_REF'] = ref
    process.env['INPUT_VERSION-WORKFLOW-ID'] = workflowId
  })

  it('should invoke version workflow with packages affected by PR', async () => {
    github.context.payload = {
      pull_request: {
        number: 123,
        merged: true,
        labels: [{ name: 'blockchain-metadata' }, { name: 'atoms' }, { name: 'refactor' }],
      },
    }

    await versionDispatch({ filesystem: fs as never })

    expect(client.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      ...repo,
      ref,
      workflow_id: workflowId,
      inputs: {
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
})
