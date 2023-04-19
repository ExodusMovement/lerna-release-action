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
      'exclude-commit-types': 'docs,chore',
      'exclude-labels': 'publish-on-merge,skip-release',
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
  type CreateComment = GithubClient['rest']['issues']['createComment']

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
        issues: {
          createComment: jest.fn() as unknown as CreateComment,
        },
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
      'libraries/wallet/package.json': JSON.stringify({ name: '@exodus/wallet' }),
      'modules/blockchain-metadata/package.json': JSON.stringify({
        name: '@exodus/blockchain-metadata',
      }),
    })
  })

  it('should invoke version workflow with packages affected by PR', async () => {
    github.context.payload = {
      pull_request: {
        title: 'feat: added a lot of new features',
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

  it('should comment on PR to let user know that versioning was started on their behalf', async () => {
    github.context.payload = {
      pull_request: {
        title: 'feat: added a lot of new features',
        number: 123,
        merged: true,
        user: {
          login: 'brucewayne',
        },
        labels: [
          { name: 'blockchain-metadata' },
          { name: 'atoms' },
          { name: 'wallet' },
          { name: 'refactor' },
        ],
      },
    }

    await versionDispatch({ filesystem: fs as never })

    expect(client.rest.issues.createComment).toHaveBeenCalledWith({
      ...repo,
      body: "@brucewayne fear not, for I have begun versioning the packages atoms, wallet, and blockchain-metadata for you. Once finished, you shall be assigned to the release PR. If releasing wasn't your plan, just close the PR.",
      issue_number: 123,
    })
  })

  describe('abort conditions', () => {
    const defaults = {
      title: 'feat: added a lot of new features',
      number: 123,
      merged: true,
      labels: [{ name: 'blockchain-metadata' }, { name: 'atoms' }, { name: 'refactor' }],
      user: {
        login: 'brucewayne',
      },
    }

    it.each<[string, any]>([
      [
        'for non-PR event',
        {
          comment: {
            id: 1,
          },
        },
      ],
      [
        'if PR was not merged',
        {
          pull_request: {
            ...defaults,
            merged: false,
          },
        },
      ],
      [
        'if none of the lerna managed packages were affected',
        {
          pull_request: {
            ...defaults,
            labels: [{ name: 'ci' }, { name: 'docs' }],
          },
        },
      ],
      ...['docs', 'chore'].flatMap<[string, any]>((type) => [
        [
          `if PR has type '${type}'`,
          {
            pull_request: {
              ...defaults,
              title: `${type}: some commit of type ${type}`,
            },
          },
        ],
        [
          `if PR has type '${type}' with scope`,
          {
            pull_request: {
              ...defaults,
              title: `${type}(arkham-asylum): some craziness of type ${type}`,
            },
          },
        ],
        [
          `if PR has type '${type}' with breaking modifier`,
          {
            pull_request: {
              ...defaults,
              title: `${type}!: some breaking commit`,
            },
          },
        ],
        [
          `if PR has type '${type}' with scope and breaking modifier`,
          {
            pull_request: {
              ...defaults,
              title: `${type}(arkham-asylum)!: some breaking craziness of type ${type}`,
            },
          },
        ],
      ]),
      [
        'if PR has label skip-release',
        {
          pull_request: {
            ...defaults,
            labels: [...defaults.labels, { name: 'skip-release' }],
          },
        },
      ],
      [
        'if PR has label publish-on-merge',
        {
          pull_request: {
            ...defaults,
            labels: [...defaults.labels, { name: 'publish-on-merge' }],
          },
        },
      ],
    ])('should abort %s', async (_, payload) => {
      github.context.payload = payload

      await versionDispatch({ filesystem: fs as never })
      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
      expect(client.rest.issues.createComment).not.toHaveBeenCalled()
    })
  })
})
