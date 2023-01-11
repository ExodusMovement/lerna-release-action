import { Volume } from 'memfs/lib/volume'
import backupPackages from './backup-packages'
import * as path from 'path'

describe('backup-package', () => {
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
    storageMobile: JSON.stringify({
      name: '@exodus/storage-mobile',
    }),
    config: JSON.stringify({
      name: '@exodus/config',
    }),
    formatting: JSON.stringify({
      name: '@exodus/formatting',
    }),
  }

  function setup(packages: string[]) {
    fs = Volume.fromJSON({
      'lerna.json': lernaConfig(packages),
      'modules/storage-mobile/package.json': packageContents.storageMobile,
      'modules/config/package.json': packageContents.config,
      'modules/.someJunkgDotfile': 'nothing of importance',
      'libraries/formatting/package.json': packageContents.formatting,
    })
  }

  it('should not throw for non existing package root', async () => {
    setup(['modules/*', 'libraries/*', '404/*'])

    await backupPackages({ filesystem: fs as never })
  })

  it('should backup package.json from packages specified in lerna.json', async () => {
    setup(['modules/*', 'libraries/*'])

    await backupPackages({ filesystem: fs as never })

    expect(read('tmp', 'backup', 'modules', 'config.json')).toEqual(packageContents.config)
    expect(read('tmp', 'backup', 'modules', 'storage-mobile.json')).toEqual(
      packageContents.storageMobile
    )
    expect(read('tmp', 'backup', 'libraries', 'formatting.json')).toEqual(
      packageContents.formatting
    )
  })

  function read(...parts: string[]) {
    return fs.readFileSync(path.join(...parts)).toString()
  }
})
