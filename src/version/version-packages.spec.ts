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
      'lerna version --conventional-commits --no-push --yes --no-private'
    )
  })

  it.each([[VersionStrategy.Patch], [VersionStrategy.Minor], [VersionStrategy.Major]])(
    'should derive %s version bumps',
    async (versionStrategy) => {
      await versionPackages({ versionStrategy })
      expect(exec).toHaveBeenCalledWith(
        `lerna version ${versionStrategy} --no-push --yes --no-private`
      )
    }
  )

  it('should append extra args', async () => {
    await versionPackages({
      versionStrategy: VersionStrategy.ConventionalCommits,
      extraArgs: '--let-bruce-wayne-decide',
    })
    expect(exec).toHaveBeenCalledWith(
      'lerna version --conventional-commits --no-push --yes --no-private --let-bruce-wayne-decide'
    )
  })
})