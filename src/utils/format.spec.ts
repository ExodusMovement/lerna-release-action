import { Volume } from 'memfs/lib/volume'
import { formatPackageFiles } from './format'
import { createFsFromJSON } from './testing'
import { spawnSync } from 'child_process'

jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ stdout: '', status: 0 })),
}))

function setup(files: Record<string, string> = {}): Volume {
  jest.mocked(spawnSync).mockClear()

  return createFsFromJSON(files)
}

describe('formatPackageFiles', () => {
  it('should be a no-op when formatCommand is empty', () => {
    const fs = setup({
      'features/foo/CHANGELOG.md': '',
      'features/foo/package.json': '{}',
    })

    formatPackageFiles({
      formatCommand: '',
      packages: ['features/foo'],
      filesystem: fs as never,
    })

    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('should be a no-op when formatCommand is whitespace only', () => {
    const fs = setup({
      'features/foo/CHANGELOG.md': '',
      'features/foo/package.json': '{}',
    })

    formatPackageFiles({
      formatCommand: '   ',
      packages: ['features/foo'],
      filesystem: fs as never,
    })

    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('should invoke the command with parsed args and existing files', () => {
    const fs = setup({
      'features/foo/CHANGELOG.md': '',
      'features/foo/package.json': '{}',
      'features/bar/CHANGELOG.md': '',
      'features/bar/package.json': '{}',
    })

    formatPackageFiles({
      formatCommand: 'yarn prettier --write',
      packages: ['features/foo', 'features/bar'],
      filesystem: fs as never,
    })

    expect(spawnSync).toHaveBeenCalledWith(
      'yarn',
      [
        'prettier',
        '--write',
        'features/foo/CHANGELOG.md',
        'features/foo/package.json',
        'features/bar/CHANGELOG.md',
        'features/bar/package.json',
      ],
      expect.anything()
    )
  })

  it('should skip files that do not exist', () => {
    const fs = setup({
      'features/foo/CHANGELOG.md': '',
      // no package.json for foo
      'features/bar/package.json': '{}',
      // no CHANGELOG.md for bar
    })

    formatPackageFiles({
      formatCommand: 'yarn prettier --write',
      packages: ['features/foo', 'features/bar'],
      filesystem: fs as never,
    })

    expect(spawnSync).toHaveBeenCalledWith(
      'yarn',
      ['prettier', '--write', 'features/foo/CHANGELOG.md', 'features/bar/package.json'],
      expect.anything()
    )
  })

  it('should skip invocation when no files exist', () => {
    const fs = setup({})

    formatPackageFiles({
      formatCommand: 'yarn prettier --write',
      packages: ['features/foo'],
      filesystem: fs as never,
    })

    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('should handle a single-token command', () => {
    const fs = setup({
      'features/foo/CHANGELOG.md': '',
    })

    formatPackageFiles({
      formatCommand: 'prettier',
      packages: ['features/foo'],
      filesystem: fs as never,
    })

    expect(spawnSync).toHaveBeenCalledWith(
      'prettier',
      ['features/foo/CHANGELOG.md'],
      expect.anything()
    )
  })
})
