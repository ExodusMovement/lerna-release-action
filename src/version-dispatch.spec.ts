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
          listComments: jest.fn() as unknown,
          createComment: jest.fn() as unknown,
          deleteComment: jest.fn() as unknown,
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

  function setupPreviewPaginate(
    commits: { sha: string; commit: { message: string } }[],
    filesBySha: Record<string, { filename: string }[]>,
    comments: { id: number; body: string }[] = []
  ) {
    const paginateMock = client.paginate as unknown as jest.Mock
    paginateMock.mockImplementation((endpoint: unknown) => {
      if (endpoint === client.rest.issues.listComments) return Promise.resolve(comments)
      return Promise.resolve(commits)
    })
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

    await versionDispatch({ filesystem: fs as never, isReleased: () => true })

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

  it('skips private packages when computing the dispatch payload', async () => {
    fs = createFsFromJSON({
      'lerna.json': lernaConfig,
      'libraries/atoms/package.json': JSON.stringify({ name: '@exodus/atoms', private: true }),
      'libraries/wallet/package.json': JSON.stringify({ name: '@exodus/wallet' }),
      'modules/blockchain-metadata/package.json': JSON.stringify({
        name: '@exodus/blockchain-metadata',
      }),
      'modules/balances/package.json': JSON.stringify({ name: '@exodus/balances' }),
    })

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
      ],
      {
        aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
        bbb2222: [{ filename: 'modules/balances/x.ts' }],
      }
    )

    await versionDispatch({ filesystem: fs as never, isReleased: () => true })

    expect(client.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      ...repo,
      ref,
      workflow_id: workflowId,
      inputs: {
        assignee: 'brucewayne',
        packages: '@exodus/balances',
        bumps: JSON.stringify({ '@exodus/balances': 'patch' }),
      },
    })
  })

  it('excludes never-released packages from the dispatch', async () => {
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
      ],
      {
        aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
        bbb2222: [{ filename: 'modules/balances/x.ts' }],
      }
    )

    // @exodus/atoms has never been released — it should be skipped, leaving
    // only the already-published @exodus/balances in the dispatch payload.
    await versionDispatch({
      filesystem: fs as never,
      isReleased: (name) => name !== '@exodus/atoms',
    })

    expect(client.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      ...repo,
      ref,
      workflow_id: workflowId,
      inputs: {
        assignee: 'brucewayne',
        packages: '@exodus/balances',
        bumps: JSON.stringify({ '@exodus/balances': 'patch' }),
      },
    })
  })

  it('does not dispatch when every bumped package is never-released', async () => {
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

    setupPaginate([{ sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } }], {
      aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
    })

    await versionDispatch({ filesystem: fs as never, isReleased: () => false })

    expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
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

    await versionDispatch({ filesystem: fs as never, isReleased: () => true })

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

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })

    it('should abort when every commit is non-bumping and PR title is also non-bumping', async () => {
      github.context.payload = {
        pull_request: { ...defaults, title: 'chore: misc cleanup' },
      }
      setupPaginate([{ sha: 'aaa1111', commit: { message: 'chore: lockfile' } }], {
        aaa1111: [{ filename: 'libraries/atoms/x.ts' }],
      })

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })

    it('should abort when no workspace package files were touched', async () => {
      github.context.payload = { pull_request: { ...defaults } }
      setupPaginate([{ sha: 'aaa1111', commit: { message: 'feat!: docs only' } }], {
        aaa1111: [{ filename: 'README.md' }],
      })

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })
  })

  describe('preview mode (unmerged PR)', () => {
    const lernaConfigWithVersions = JSON.stringify({
      packages: ['libraries/*', 'modules/{blockchain-metadata,balances}'],
    })

    const PREVIEW_MARKER = '<!-- lerna-release-action:version-preview -->'

    beforeEach(() => {
      fs = createFsFromJSON({
        'lerna.json': lernaConfigWithVersions,
        'libraries/atoms/package.json': JSON.stringify({ name: '@exodus/atoms', version: '1.0.0' }),
        'libraries/wallet/package.json': JSON.stringify({
          name: '@exodus/wallet',
          version: '3.4.5',
        }),
        'modules/blockchain-metadata/package.json': JSON.stringify({
          name: '@exodus/blockchain-metadata',
          version: '0.1.0',
        }),
        'modules/balances/package.json': JSON.stringify({
          name: '@exodus/balances',
          version: '2.7.9',
        }),
      })
    })

    it('posts a sticky comment instead of dispatching when PR is open', async () => {
      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [],
        },
      }

      setupPreviewPaginate([{ sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } }], {
        aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
      })

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
      expect(client.rest.issues.createComment).toHaveBeenCalledTimes(1)
      const [args] = (client.rest.issues.createComment as unknown as jest.Mock).mock.calls[0]
      expect(args.issue_number).toBe(555)
      expect(args.body).toContain(PREVIEW_MARKER)
      expect(args.body).toContain('@exodus/atoms')
      expect(args.body).toContain('2.0.0')
    })

    it('renders never-released packages as first releases in the preview', async () => {
      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [],
        },
      }

      setupPreviewPaginate(
        [
          { sha: 'aaa1111', commit: { message: 'feat(atoms): brand new package' } },
          { sha: 'bbb2222', commit: { message: 'fix(balances): tidy' } },
        ],
        {
          aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
          bbb2222: [{ filename: 'modules/balances/x.ts' }],
        }
      )

      // @exodus/atoms (declared 1.0.0) has never been released.
      await versionDispatch({
        filesystem: fs as never,
        isReleased: (name) => name !== '@exodus/atoms',
      })

      expect(client.rest.issues.createComment).toHaveBeenCalledTimes(1)
      const [args] = (client.rest.issues.createComment as unknown as jest.Mock).mock.calls[0]
      // First release: no current version, next is the declared 1.0.0, and a
      // manual-release note is included.
      expect(args.body).toContain(
        '| `@exodus/atoms` | first release — publish manually | — | 1.0.0 |'
      )
      expect(args.body).toContain('Manual publish needed')
      // The already-published package still previews a normal bump.
      expect(args.body).toContain('| `@exodus/balances` | patch | 2.7.9 | 2.7.10 |')
    })

    it('deletes every stale preview comment before posting the new one', async () => {
      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [],
        },
      }

      setupPreviewPaginate(
        [{ sha: 'bbb2222', commit: { message: 'fix(balances): tidy' } }],
        { bbb2222: [{ filename: 'modules/balances/x.ts' }] },
        [
          { id: 9001, body: `${PREVIEW_MARKER}\nstale one` },
          { id: 9002, body: 'unrelated reviewer comment' },
          { id: 9003, body: `${PREVIEW_MARKER}\nstale two` },
        ]
      )

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.issues.deleteComment).toHaveBeenCalledTimes(2)
      expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
        ...repo,
        comment_id: 9001,
      })
      expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
        ...repo,
        comment_id: 9003,
      })
      expect(client.rest.issues.createComment).toHaveBeenCalledTimes(1)
    })

    it('clears stale preview comments when skip-release is added mid-flight', async () => {
      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [{ name: 'skip-release' }],
        },
      }

      setupPreviewPaginate(
        [{ sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } }],
        { aaa1111: [{ filename: 'libraries/atoms/index.ts' }] },
        [{ id: 9100, body: `${PREVIEW_MARKER}\nstale preview from before the label was added` }]
      )

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
        ...repo,
        comment_id: 9100,
      })
      expect(client.rest.issues.createComment).not.toHaveBeenCalled()
      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })

    it('clears stale preview comments when the PR base is retargeted off the default branch', async () => {
      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref: 'wayne-foundation/batmobile-v2' },
          labels: [],
        },
      }

      setupPreviewPaginate(
        [{ sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } }],
        { aaa1111: [{ filename: 'libraries/atoms/index.ts' }] },
        [{ id: 9101, body: `${PREVIEW_MARKER}\nstale preview from when base was master` }]
      )

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
        ...repo,
        comment_id: 9101,
      })
      expect(client.rest.issues.createComment).not.toHaveBeenCalled()
    })

    it('omits private packages from the preview comment', async () => {
      fs = createFsFromJSON({
        'lerna.json': lernaConfigWithVersions,
        'libraries/atoms/package.json': JSON.stringify({
          name: '@exodus/atoms',
          version: '1.0.0',
          private: true,
        }),
        'libraries/wallet/package.json': JSON.stringify({
          name: '@exodus/wallet',
          version: '3.4.5',
        }),
        'modules/blockchain-metadata/package.json': JSON.stringify({
          name: '@exodus/blockchain-metadata',
          version: '0.1.0',
        }),
        'modules/balances/package.json': JSON.stringify({
          name: '@exodus/balances',
          version: '2.7.9',
        }),
      })

      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [],
        },
      }

      setupPreviewPaginate(
        [
          { sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } },
          { sha: 'bbb2222', commit: { message: 'fix(balances): tidy' } },
        ],
        {
          aaa1111: [{ filename: 'libraries/atoms/index.ts' }],
          bbb2222: [{ filename: 'modules/balances/x.ts' }],
        }
      )

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.issues.createComment).toHaveBeenCalledTimes(1)
      const [args] = (client.rest.issues.createComment as unknown as jest.Mock).mock.calls[0]
      expect(args.body).toContain('@exodus/balances')
      expect(args.body).not.toContain('@exodus/atoms')
    })

    it('clears stale preview comments when every touched package is private', async () => {
      fs = createFsFromJSON({
        'lerna.json': lernaConfigWithVersions,
        'libraries/atoms/package.json': JSON.stringify({
          name: '@exodus/atoms',
          version: '1.0.0',
          private: true,
        }),
        'libraries/wallet/package.json': JSON.stringify({
          name: '@exodus/wallet',
          version: '3.4.5',
        }),
        'modules/blockchain-metadata/package.json': JSON.stringify({
          name: '@exodus/blockchain-metadata',
          version: '0.1.0',
        }),
        'modules/balances/package.json': JSON.stringify({
          name: '@exodus/balances',
          version: '2.7.9',
        }),
      })

      github.context.payload = {
        pull_request: {
          title: 'feat: pending',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [],
        },
      }

      setupPreviewPaginate(
        [{ sha: 'aaa1111', commit: { message: 'feat(atoms)!: drop legacy' } }],
        { aaa1111: [{ filename: 'libraries/atoms/index.ts' }] },
        [{ id: 9200, body: `${PREVIEW_MARKER}\nstale preview from before private flag was set` }]
      )

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
        ...repo,
        comment_id: 9200,
      })
      expect(client.rest.issues.createComment).not.toHaveBeenCalled()
    })

    it('clears stale comments and posts nothing when no commits bump anything', async () => {
      github.context.payload = {
        pull_request: {
          title: 'chore: cleanup',
          number: 555,
          merged: false,
          state: 'open',
          user: { login: 'brucewayne' },
          base: { ref },
          labels: [],
        },
      }

      setupPreviewPaginate(
        [{ sha: 'ccc3333', commit: { message: 'chore: lockfile' } }],
        { ccc3333: [{ filename: 'libraries/atoms/x.ts' }] },
        [{ id: 9004, body: `${PREVIEW_MARKER}\nstale preview` }]
      )

      await versionDispatch({ filesystem: fs as never, isReleased: () => true })

      expect(client.rest.issues.deleteComment).toHaveBeenCalledWith({
        ...repo,
        comment_id: 9004,
      })
      expect(client.rest.issues.createComment).not.toHaveBeenCalled()
      expect(client.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled()
    })
  })
})
