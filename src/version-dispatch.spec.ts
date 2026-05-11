import * as github from '@actions/github'
import { versionDispatch } from './version-dispatch'
import { GithubClient } from './utils/github'
import { Volume } from 'memfs/lib/volume'
import { createFsFromJSON } from './utils/testing'

const ref = 'main'

jest.mock('@actions/core', () => ({
  getInput: (name: string) => {
    const inputs: Record<string, unknown> = {
      ref,
      'version-workflow-id': 'a tiny little workflow',
      'github-token': 'abc',
      'exclude-labels': 'publish-on-merge,skip-release',
      'dry-run': 'false',
      'pr-number': '',
    }
    return inputs[name]
  },
  debug: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  notice: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
}))

describe('versionDispatch', () => {
  type CreateWorkflowDispatch = GithubClient['rest']['actions']['createWorkflowDispatch']

  const repo = {
    owner: 'WayneFoundation',
    repo: 'batcave',
  }

  const workflowId = 'a tiny little workflow'

  const lernaConfig = JSON.stringify({
    packages: ['libraries/*', 'modules/{blockchain-metadata,balances}'],
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
      paginate: jest.fn() as unknown,
      rest: {
        repos: {
          get: jest.fn(async () => ({
            data: {
              default_branch: ref,
            },
          })) as unknown,
          getCommit: jest.fn() as unknown,
        },
        pulls: {
          listCommits: jest.fn() as unknown,
          get: jest.fn() as unknown,
        },
        issues: {
          createComment: jest.fn() as unknown,
        },
        actions: {
          createWorkflowDispatch: jest.fn() as unknown as CreateWorkflowDispatch,
        },
      },
    } as GithubClient

    Object.defineProperty(github.context, 'repo', {
      value: repo,
    })

    fs = createFsFromJSON({
      'lerna.json': lernaConfig,
      'libraries/atoms/package.json': JSON.stringify({ name: '@exodus/atoms' }),
      'libraries/wallet/package.json': JSON.stringify({ name: '@exodus/wallet' }),
      'modules/blockchain-metadata/package.json': JSON.stringify({
        name: '@exodus/blockchain-metadata',
      }),
      'modules/balances/package.json': JSON.stringify({
        name: '@exodus/balances',
      }),
    })
  })

  function setupPaginate(
    commits: { sha: string; commit: { message: string } }[],
    filesBySha: Record<string, { filename: string }[]>
  ) {
    const paginateMock = client.paginate as unknown as jest.Mock
    paginateMock.mockResolvedValue(commits)
    ;(client.rest.repos.getCommit as unknown as jest.Mock).mockImplementation(
      async ({ ref: sha }: { ref: string }) => ({
        data: { files: filesBySha[sha] ?? [] },
      })
    )
  }

  it('dispatches with the per-package bump map computed from PR commits', async () => {
    github.context.payload = {
      pull_request: {
        title: 'feat: cool stuff',
        number: 123,
        merged: true,
        user: { login: 'brucewayne' },
        base: { ref },
        labels: [],
      },
    }

    setupPaginate(
      [
        { sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } },
        { sha: 'bbb2222', commit: { message: 'fix(balances): tidy' } },
        { sha: 'ccc3333', commit: { message: 'refactor(atoms): rename' } },
      ],
      {
        aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
        bbb2222: [{ filename: 'modules/balances/x.ts' }],
        ccc3333: [{ filename: 'libraries/atoms/y.ts' }],
      }
    )

    await versionDispatch({ filesystem: fs as never })

    expect(client.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      ...repo,
      ref,
      workflow_id: workflowId,
      inputs: {
        assignee: 'brucewayne',
        packages: '@exodus/atoms,@exodus/balances',
        bumps: JSON.stringify({ '@exodus/atoms': 'major', '@exodus/balances': 'patch' }),
      },
    })
  })

  it('falls back to the PR title when no commit carries a bump', async () => {
    github.context.payload = {
      pull_request: {
        title: 'feat(atoms)!: title-fallback test',
        number: 123,
        merged: true,
        user: { login: 'brucewayne' },
        base: { ref },
        labels: [],
      },
    }

    setupPaginate(
      [
        { sha: 'aaa1111', commit: { message: 'refactor(atoms): migrate' } },
        { sha: 'bbb2222', commit: { message: 'chore: lockfile' } },
      ],
      {
        aaa1111: [{ filename: 'libraries/atoms/x.ts' }],
        bbb2222: [{ filename: 'libraries/atoms/yarn.lock' }],
      }
    )

    await versionDispatch({ filesystem: fs as never })

    expect(client.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      ...repo,
      ref,
      workflow_id: workflowId,
      inputs: {
        assignee: 'brucewayne',
        packages: '@exodus/atoms',
        bumps: JSON.stringify({ '@exodus/atoms': 'major' }),
      },
    })
  })

  describe('abort conditions', () => {
    const defaults = {
      title: 'feat: a real release',
      number: 123,
      merged: true,
      labels: [],
      user: { login: 'brucewayne' },
      base: { ref },
    }

    it.each<[string, unknown]>([
      ['for non-PR event', { comment: { id: 1 } }],
      [
        'for not targeting the default branch',
        {
          pull_request: { ...defaults, base: { ref: 'wayne-foundation/batmobile-v2' } },
        },
      ],
      ['if PR was not merged', { pull_request: { ...defaults, merged: false } }],
      [
        'if PR has label skip-release',
        {
          pull_request: { ...defaults, labels: [{ name: 'skip-release' }] },
        },
      ],
      [
        'if PR has label publish-on-merge',
        {
          pull_request: { ...defaults, labels: [{ name: 'publish-on-merge' }] },
        },
      ],
    ])('should abort %s', async (_, payload) => {
      github.context.payload = payload as never
      setupPaginate([], {})

      await versionDispatch({ filesystem: fs as never })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })

    it('should abort when every commit is non-bumping and PR title is also non-bumping', async () => {
      github.context.payload = {
        pull_request: { ...defaults, title: 'chore: misc cleanup' },
      }
      setupPaginate([{ sha: 'aaa1111', commit: { message: 'chore: lockfile' } }], {
        aaa1111: [{ filename: 'libraries/atoms/x.ts' }],
      })

      await versionDispatch({ filesystem: fs as never })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })

    it('should abort when no workspace package files were touched', async () => {
      github.context.payload = { pull_request: { ...defaults } }
      setupPaginate([{ sha: 'aaa1111', commit: { message: 'feat!: docs only' } }], {
        aaa1111: [{ filename: 'README.md' }],
      })

      await versionDispatch({ filesystem: fs as never })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })
  })
})
