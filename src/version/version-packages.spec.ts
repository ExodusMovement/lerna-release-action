import versionPackages from './version-packages'
import { VersionStrategy } from './strategy'
import { spawnSync } from 'child_process'

jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ stdout: '', status: 0 })),
}))

describe('versionPackages', () => {
  it('should derive bumps using conventional commits', async () => {
    versionPackages({ versionStrategy: VersionStrategy.ConventionalCommits })
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      [
        'lerna',
        'version',
        '--conventional-commits',
        '--no-push',
        '--force-git-tag',
        '--yes',
        '--no-private',
        '--force-publish',
      ],
      { encoding: 'utf8', shell: false }
    )
  })

  it.each([
    [VersionStrategy.Patch],
    [VersionStrategy.Minor],
    [VersionStrategy.Major],
    [VersionStrategy.Prerelease],
    [VersionStrategy.Premajor],
    [VersionStrategy.Preminor],
    [VersionStrategy.Prepatch],
  ])('should derive %s version bumps', async (versionStrategy) => {
    await versionPackages({ versionStrategy })
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      [
        'lerna',
        'version',
        versionStrategy,
        '--no-push',
        '--force-git-tag',
        '--yes',
        '--no-private',
        '--force-publish',
      ],
      { encoding: 'utf8', shell: false }
    )
  })

  it('should append extra args', async () => {
    await versionPackages({
      versionStrategy: VersionStrategy.ConventionalCommits,
      extraArgs: '--let-bruce-wayne-decide',
    })
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      [
        'lerna',
        'version',
        '--conventional-commits',
        '--no-push',
        '--force-git-tag',
        '--yes',
        '--no-private',
        '--force-publish',
        '--let-bruce-wayne-decide',
      ],
      { encoding: 'utf8', shell: false }
    )
  })
})
