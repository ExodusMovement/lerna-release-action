import { Volume } from 'memfs/lib/volume'
import { PackageJson } from '../utils/types'
import { validateAllowedStrategies, VersionStrategy } from './strategy'
import { createFsFromJSON } from '../utils/testing'

describe('validateAllowedStrategies', () => {
  let fs: Volume

  function setup(versionStrategy?: { [packageName: string]: VersionStrategy[] }) {
    const packageJson = JSON.stringify({
      name: 'assets',
      ...(versionStrategy && { release: { versionStrategy } }),
    } as PackageJson)

    fs = createFsFromJSON({
      'package.json': packageJson,
      'packages/assets/package.json': JSON.stringify({ name: '@exodus/assets' }),
    })
  }

  it('should allow any strategy if not configured', async () => {
    setup({
      '@exodus/unrelated': [VersionStrategy.Minor],
    })
    await expect(
      Promise.all(
        Object.values(VersionStrategy).map((versionStrategy) =>
          validateAllowedStrategies({
            packages: ['libraries/batcave'],
            versionStrategy,
            filesystem: fs as never,
          })
        )
      )
    ).resolves.not.toThrow()
  })

  it('should not throw if no release configuration present', async () => {
    setup()
    await expect(
      validateAllowedStrategies({
        packages: ['libraries/batcave'],
        versionStrategy: VersionStrategy.Major,
        filesystem: fs as never,
      })
    ).resolves.not.toThrow()
  })

  it('should throw when using a strategy that is not listed for existing entry', async () => {
    setup({
      '@exodus/assets': [VersionStrategy.Patch, VersionStrategy.Minor],
    })

    await expect(
      validateAllowedStrategies({
        packages: ['packages/assets'],
        versionStrategy: VersionStrategy.ConventionalCommits,
        filesystem: fs as never,
      })
    ).rejects.toThrow(
      'Attempted to use version strategy "conventional-commits", which is not allowed for @exodus/assets. Allowed strategies are: patch, minor'
    )
  })
})
