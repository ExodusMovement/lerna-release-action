import { Volume } from 'memfs/lib/volume'
import revertUnwantedDependencyChanges from './revert-unwanted-dependency-changes'
import { readJson } from '../utils/fs'
import { PackageJson } from '../utils/types'
import { createFsFromJSON } from '../utils/testing'

describe('revertUnwantedDependencyChanges', () => {
  let fs: Volume

  const lernaConfig = (packages: string[]) =>
    JSON.stringify({
      packages: packages,
      version: 'independent',
      npmClient: 'yarn',
      useWorkspaces: true,
      useNx: true,
    })

  const packageContents = {
    batcave: JSON.stringify({
      name: '@exodus/batcave',
      dependencies: {
        '@exodus/batstorage': '1.0.4',
        '@exodus/baterang': '1.0.5',
        '@exodus/atoms': '1.0.1',
      },
      devDependencies: {
        '@exodus/in-memory-bat-storage': '1.0.6',
      },
    }),
    baterang: JSON.stringify({
      name: '@exodus/baterang',
      dependencies: {
        '@exodus/batstorage': '1.0.4',
      },
    }),
    batstorage: JSON.stringify({
      name: '@exodus/batstorage',
    }),
    'in-memory-bat-storage': JSON.stringify({
      name: '@exodus/in-memory-bat-storage',
    }),
    atoms: JSON.stringify({
      name: '@exodus/atoms',
    }),
    wallet: JSON.stringify({
      name: '@exodus/wallet',
    }),
  }

  const previousPackageContents = {
    'packages/batcave': {
      name: '@exodus/batcave',
      dependencies: {
        '@exodus/batstorage': '1.0.1',
        '@exodus/baterang': '1.0.2',
        '@exodus/atoms': '1.0.0',
      },
      devDependencies: {
        '@exodus/in-memory-bat-storage': '1.0.3',
      },
    },
    'packages/baterang': {
      name: '@exodus/baterang',
      dependencies: {
        '@exodus/batstorage': '1.0.1',
      },
    },
    'packages/batstorage': {
      name: '@exodus/batstorage',
    },
    'packages/in-memory-bat-storage': {
      name: '@exodus/in-memory-bat-storage',
    },
    'libraries/atoms': {
      name: '@exodus/atoms',
    },
    'libraries/wallet': {
      name: '@exodus/wallet',
    },
  }

  beforeEach(() => {
    fs = createFsFromJSON({
      'lerna.json': lernaConfig(['packages/*', 'libraries/{atoms,wallet}']),
      'packages/batcave/package.json': packageContents.batcave,
      'packages/batstorage/package.json': packageContents.batstorage,
      'packages/baterang/package.json': packageContents.baterang,
      'packages/in-memory-bat-storage/package.json': packageContents['in-memory-bat-storage'],
      'libraries/atoms/package.json': packageContents['atoms'],
      'libraries/wallet/package.json': packageContents['wallet'],
    })
  })

  it('should revert version bumps of dependencies not selected for release', async () => {
    await revertUnwantedDependencyChanges({
      packages: ['packages/batcave', 'packages/baterang'],
      previousPackageContents,
      filesystem: fs as never,
    })

    const packageJson = {
      batcave: await readJson<PackageJson>('packages/batcave/package.json', {
        filesystem: fs as never,
      }),
      baterang: await readJson<PackageJson>('packages/baterang/package.json', {
        filesystem: fs as never,
      }),
    }

    expect(packageJson.batcave?.dependencies).toEqual({
      '@exodus/baterang': '1.0.5', // unchanged
      '@exodus/batstorage': '1.0.1', // reverted because not included in release
      '@exodus/atoms': '1.0.0', // reverted because not included in release
    })

    expect(packageJson.batcave?.devDependencies).toEqual({
      '@exodus/in-memory-bat-storage': '1.0.3', // reverted because not included in release
    })

    expect(packageJson.baterang?.dependencies).toEqual({
      '@exodus/batstorage': '1.0.1', // reverted because not included in release
    })
  })
})
