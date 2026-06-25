import { applyWorkingDirectory, toWorkspaceRelativePaths } from './working-directory'
import { spawnSync } from './process'

jest.mock('./process', () => ({
  spawnSync: jest.fn(),
}))

jest.mock('@actions/core', () => ({
  info: jest.fn(),
}))

const mockedSpawnSync = jest.mocked(spawnSync)

describe('applyWorkingDirectory', () => {
  let chdir: jest.SpyInstance
  let cwd: jest.SpyInstance

  beforeEach(() => {
    chdir = jest.spyOn(process, 'chdir').mockImplementation(() => undefined)
    cwd = jest.spyOn(process, 'cwd')
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('is a no-op at the repo root when no working directory is given', () => {
    cwd.mockReturnValue('/repo')

    const workspace = applyWorkingDirectory('')

    expect(chdir).not.toHaveBeenCalled()
    expect(mockedSpawnSync).not.toHaveBeenCalled()
    expect(workspace).toEqual({ repoRoot: '/repo', repoRelativePrefix: '' })
  })

  it('changes into a subdirectory and reports its path relative to the repo root', () => {
    cwd.mockReturnValue('/repo/apps/mobile')
    mockedSpawnSync.mockReturnValue('/repo\n')

    const workspace = applyWorkingDirectory('apps/mobile')

    expect(chdir).toHaveBeenCalledWith('apps/mobile')
    expect(mockedSpawnSync).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'])
    expect(workspace).toEqual({ repoRoot: '/repo', repoRelativePrefix: 'apps/mobile' })
  })

  it('reports an empty prefix when the working directory is itself the repo root', () => {
    cwd.mockReturnValue('/nested/checkout')
    mockedSpawnSync.mockReturnValue('/nested/checkout\n')

    const workspace = applyWorkingDirectory('nested/checkout')

    expect(workspace).toEqual({ repoRoot: '/nested/checkout', repoRelativePrefix: '' })
  })
})

describe('toWorkspaceRelativePaths', () => {
  it('returns paths unchanged when the prefix is empty', () => {
    const paths = ['libraries/a/index.ts', 'README.md']
    expect(toWorkspaceRelativePaths(paths, '')).toEqual(paths)
  })

  it('strips the prefix and drops paths outside the working directory', () => {
    const paths = [
      'apps/mobile/libraries/a/index.ts',
      'apps/mobile/package.json',
      'README.md',
      'apps/other/libraries/b/index.ts',
    ]

    expect(toWorkspaceRelativePaths(paths, 'apps/mobile')).toEqual([
      'libraries/a/index.ts',
      'package.json',
    ])
  })

  it('does not match a sibling directory sharing the prefix', () => {
    expect(toWorkspaceRelativePaths(['apps/mobile-old/x.ts'], 'apps/mobile')).toEqual([])
  })

  it('tolerates a prefix that already ends with a slash', () => {
    expect(toWorkspaceRelativePaths(['apps/mobile/x.ts'], 'apps/mobile/')).toEqual(['x.ts'])
  })
})
