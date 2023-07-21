import { Volume } from 'memfs/lib/volume'
import normalizePackages from './normalize-packages'
import { createFsFromJSON } from '../utils/testing'

describe('normalizePackages', () => {
  let fs: Volume

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
    theUltimatePackage: JSON.stringify({
      name: '@exodus/the-ultimate-package',
    }),
    bruce: JSON.stringify({
      name: '@exodus/bruce',
    }),
    batman: JSON.stringify({
      name: '@exodus/batman',
    }),
  }
  const lernaConfig = JSON.stringify({
    packages: [
      'libraries/*',
      'modules/*',
      'deeply/nested/package/root/*',
      'groups/wayne/{bruce,batman}',
    ],
    version: 'independent',
    npmClient: 'yarn',
    useWorkspaces: true,
    useNx: true,
  })

  beforeEach(() => {
    fs = createFsFromJSON({
      'lerna.json': lernaConfig,
      'modules/storage-mobile/package.json': packageContents.storageMobile,
      'deeply/nested/package/root/the-ultimate-package/package.json':
        packageContents.theUltimatePackage,
      'modules/config/package.json': packageContents.config,
      'libraries/formatting/package.json': packageContents.formatting,
      'groups/wayne/bruce/package.json': packageContents.bruce,
      'groups/wayne/batman/package.json': packageContents.batman,
    })
  })

  it('should trim spaces', async () => {
    const result = await normalizePackages({
      packagesCsv: ' libraries/formatting, modules/config ',
      filesystem: fs as never,
    })
    expect(result).toEqual(['libraries/formatting', 'modules/config'])
  })

  it('should remove empty values', async () => {
    const result = await normalizePackages({
      packagesCsv: ',libraries/formatting, ,modules/config,',
      filesystem: fs as never,
    })
    expect(result).toEqual(['libraries/formatting', 'modules/config'])
  })

  it('should normalize paths', async () => {
    const result = await normalizePackages({
      packagesCsv: 'formatting,config',
      filesystem: fs as never,
    })
    expect(result).toEqual(['libraries/formatting', 'modules/config'])
  })

  it('should normalize package names', async () => {
    const result = await normalizePackages({
      packagesCsv: '@exodus/formatting, @exodus/config ',
      filesystem: fs as never,
    })
    expect(result).toEqual(['libraries/formatting', 'modules/config'])
  })

  it('should normalize deeply nested package name', async () => {
    const result = await normalizePackages({
      packagesCsv: '@exodus/the-ultimate-package',
      filesystem: fs as never,
    })
    expect(result).toEqual(['deeply/nested/package/root/the-ultimate-package'])
  })

  it('should normalize deeply nested short name', async () => {
    const result = await normalizePackages({
      packagesCsv: 'the-ultimate-package',
      filesystem: fs as never,
    })
    expect(result).toEqual(['deeply/nested/package/root/the-ultimate-package'])
  })

  it('should normalize grouped package name', async () => {
    const result = await normalizePackages({
      packagesCsv: '@exodus/bruce, @exodus/batman',
      filesystem: fs as never,
    })
    expect(result).toEqual(['groups/wayne/bruce', 'groups/wayne/batman'])
  })

  it('should normalize grouped short name', async () => {
    const result = await normalizePackages({
      packagesCsv: 'bruce, batman',
      filesystem: fs as never,
    })
    expect(result).toEqual(['groups/wayne/bruce', 'groups/wayne/batman'])
  })

  it('should throw for non existing short names', async () => {
    const promise = normalizePackages({
      packagesCsv: 'batcave, formatting',
      filesystem: fs as never,
    })
    await expect(promise).rejects.toThrow()
  })

  it('should throw for non existing package names', async () => {
    const promise = normalizePackages({
      packagesCsv: '@exodus/formatting,@exodus/wayne-enterprises,@exodus/batcave',
      filesystem: fs as never,
    })
    await expect(promise).rejects.toThrow()
  })

  it('should throw for non existing package roots', async () => {
    const promise = normalizePackages({
      packagesCsv: 'packages/formatting,misc/test',
      filesystem: fs as never,
    })
    await expect(promise).rejects.toThrow()
  })
})
