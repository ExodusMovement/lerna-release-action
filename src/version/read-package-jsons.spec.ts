import { Volume } from 'memfs/lib/volume'
import readPackageJsons from './read-package-jsons'
import { createFsFromJSON } from '../utils/testing'

describe('readPackageJsons', () => {
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
    storageMobile: {
      name: '@exodus/storage-mobile',
    },
    config: {
      name: '@exodus/config',
    },
    formatting: {
      name: '@exodus/formatting',
    },
  }

  function setup(packages: string[]) {
    fs = createFsFromJSON({
      'lerna.json': lernaConfig(packages),
      'modules/storage-mobile/package.json': JSON.stringify(packageContents.storageMobile),
      'modules/config/package.json': JSON.stringify(packageContents.config),
      'modules/.someJunkgDotfile': 'nothing of importance',
      'libraries/formatting/package.json': JSON.stringify(packageContents.formatting),
    })
  }

  it('should not throw for non existing package root', async () => {
    setup(['modules/*', 'libraries/*', '404/*'])

    await readPackageJsons({ filesystem: fs as never })
  })

  it('should backup package.json from packages specified in lerna.json', async () => {
    setup(['modules/{storage-mobile,config}', 'libraries/*'])

    const packages = await readPackageJsons({ filesystem: fs as never })

    expect(packages).toEqual({
      'modules/config': packageContents.config,
      'modules/storage-mobile': packageContents.storageMobile,
      'libraries/formatting': packageContents.formatting,
    })
  })
})
