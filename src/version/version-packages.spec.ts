import versionPackages from './version-packages'
import { VersionStrategy } from './strategy'
import { exec } from '../utils/process'

jest.mock('../utils/process', () => ({
  exec: jest.fn(() => ({ stdout: '' })),
}))

describe('versionPackages', () => {
  it('should derive bumps using conventional commits', async () => {
    await versionPackages({ versionStrategy: VersionStrategy.ConventionalCommits })
    expect(exec).toHaveBeenCalledWith(
      'npx lerna version --conventional-commits --no-push --yes --no-private --force-publish'
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
    expect(exec).toHaveBeenCalledWith(
      `npx lerna version ${versionStrategy} --no-push --yes --no-private --force-publish`
    )
  })

  it('should append extra args', async () => {
    await versionPackages({
      versionStrategy: VersionStrategy.ConventionalCommits,
      extraArgs: '--let-bruce-wayne-decide',
    })
    expect(exec).toHaveBeenCalledWith(
      'npx lerna version --conventional-commits --no-push --yes --no-private --force-publish --let-bruce-wayne-decide'
    )
  })
})
