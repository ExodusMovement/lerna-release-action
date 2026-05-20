import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import versionPackages, { versionPackagesExplicit } from './version-packages'
import { VersionStrategy } from './strategy'
import { spawnSync } from 'child_process'

jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ stdout: '', status: 0 })),
}))

const mockGetPaths = jest.fn(async () => ({}) as Record<string, string>)
jest.mock('@exodus/lerna-utils', () => ({
  getPathsByPackageNames: (...args: unknown[]) => mockGetPaths(...(args as [])),
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

describe('versionPackagesExplicit', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'version-packages-explicit-'))
    ;(spawnSync as unknown as jest.Mock).mockClear()
    mockGetPaths.mockResolvedValue({})
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  function writePackageJson(dir: string, contents: object): string {
    const pkgPath = path.join(tmpRoot, dir)
    fs.mkdirSync(pkgPath, { recursive: true })
    fs.writeFileSync(path.join(pkgPath, 'package.json'), `${JSON.stringify(contents, null, 2)}\n`)
    return pkgPath
  }

  it('bumps the version field in place via semver.inc, leaves the rest of package.json untouched', async () => {
    const pkgDir = writePackageJson('mab', {
      name: '@exodus/multi-account-redux',
      version: '2.1.1',
      dependencies: { lodash: '^4.17.21' },
    })

    const count = await versionPackagesExplicit({
      bumps: { '@exodus/multi-account-redux': 'major' },
      packages: [pkgDir],
    })

    expect(count).toBe(1)
    const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    expect(after.version).toBe('3.0.0')
    expect(after.dependencies).toEqual({ lodash: '^4.17.21' })
  })

  it('tolerates `workspace:*` devDeps without invoking npm (regression: npm rejects workspace: protocol)', async () => {
    const pkgDir = writePackageJson('mab', {
      name: '@exodus/multi-account-redux',
      version: '2.1.1',
      dependencies: { '@exodus/basic-utils': '^5.0.0' },
      devDependencies: {
        '@exodus/assets-feature': 'workspace:*',
        '@exodus/wallet-accounts': 'workspace:*',
      },
    })

    await expect(
      versionPackagesExplicit({
        bumps: { '@exodus/multi-account-redux': 'major' },
        packages: [pkgDir],
      })
    ).resolves.not.toThrow()

    const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    expect(after.version).toBe('3.0.0')
    expect(after.devDependencies).toEqual({
      '@exodus/assets-feature': 'workspace:*',
      '@exodus/wallet-accounts': 'workspace:*',
    })

    const calls = (spawnSync as unknown as jest.Mock).mock.calls.map((c) => c[0])
    expect(calls).not.toContain('npm')
  })

  it('creates one git commit + annotated tag per bumps entry', async () => {
    const mabDir = writePackageJson('mab', { name: '@exodus/mab', version: '1.0.0' })
    const balancesDir = writePackageJson('balances', { name: '@exodus/balances', version: '2.5.0' })

    await versionPackagesExplicit({
      bumps: { '@exodus/mab': 'major', '@exodus/balances': 'patch' },
      packages: [mabDir, balancesDir],
    })

    const gitCalls = (spawnSync as unknown as jest.Mock).mock.calls.filter((c) => c[0] === 'git')
    const tagCalls = gitCalls.filter((c) => c[1][0] === 'tag')
    expect(tagCalls.map((c) => c[1][2])).toEqual(['@exodus/mab@2.0.0', '@exodus/balances@2.5.1'])

    const commitCalls = gitCalls.filter((c) => c[1][0] === 'commit')
    expect(commitCalls).toHaveLength(2)
  })

  it("throws when a bump's package name is not in `packages`", async () => {
    const pkgDir = writePackageJson('mab', { name: '@exodus/mab', version: '1.0.0' })

    await expect(
      versionPackagesExplicit({
        bumps: { '@exodus/not-here': 'major' },
        packages: [pkgDir],
      })
    ).rejects.toThrow(/not present in `packages`/)
  })

  describe('prerelease handling', () => {
    it.each([
      ['5.0.0-rc.96', 'major', '5.0.0-rc.97'],
      ['5.0.0-rc.96', 'minor', '5.0.0-rc.97'],
      ['5.0.0-rc.96', 'patch', '5.0.0-rc.97'],
      ['1.0.0-alpha.0', 'major', '1.0.0-alpha.1'],
      ['2.0.0-beta.3', 'patch', '2.0.0-beta.4'],
    ])(
      'bumps the rc counter on %s + %s → %s instead of dropping the prerelease',
      async (current, bump, expected) => {
        const pkgDir = writePackageJson('headless', { name: '@exodus/headless', version: current })

        await versionPackagesExplicit({
          bumps: { '@exodus/headless': bump },
          packages: [pkgDir],
        })

        const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
        expect(after.version).toBe(expected)
      }
    )

    it('does not walk consumer pins when bumping a prerelease (the rc counter bump is not a major change)', async () => {
      const headlessDir = writePackageJson('sdks/headless', {
        name: '@exodus/headless',
        version: '5.0.0-rc.96',
      })
      const consumerDir = writePackageJson('apps/wallet', {
        name: '@exodus/wallet-app',
        version: '1.0.0',
        dependencies: { '@exodus/headless': '^5.0.0-rc.0' },
      })

      mockGetPaths.mockResolvedValue({
        '@exodus/headless': headlessDir,
        '@exodus/wallet-app': consumerDir,
      })

      await versionPackagesExplicit({
        bumps: { '@exodus/headless': 'major' },
        packages: [headlessDir],
      })

      const consumer = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8'))
      expect(consumer.dependencies['@exodus/headless']).toBe('^5.0.0-rc.0')
    })

    it('uses the regular semver.inc path for stable versions (5.0.0 + major → 6.0.0)', async () => {
      const pkgDir = writePackageJson('headless', { name: '@exodus/headless', version: '5.0.0' })

      await versionPackagesExplicit({
        bumps: { '@exodus/headless': 'major' },
        packages: [pkgDir],
      })

      const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
      expect(after.version).toBe('6.0.0')
    })
  })

  it('throws when semver.inc rejects the bump level', async () => {
    const pkgDir = writePackageJson('mab', { name: '@exodus/mab', version: '1.0.0' })

    await expect(
      versionPackagesExplicit({
        bumps: { '@exodus/mab': 'not-a-bump' },
        packages: [pkgDir],
      })
    ).rejects.toThrow(/semver\.inc rejected bump/)
  })

  describe('consumer-pin updates', () => {
    it("rewrites the bumped package's pin in every consumer's package.json, preserving the range prefix", async () => {
      const mabDir = writePackageJson('libraries/mab', {
        name: '@exodus/multi-account-redux',
        version: '2.1.1',
      })
      const balancesDir = writePackageJson('features/balances', {
        name: '@exodus/balances',
        version: '13.0.0',
        dependencies: { '@exodus/multi-account-redux': '^2.0.1' },
      })
      const optBalancesDir = writePackageJson('features/optimistic-balances', {
        name: '@exodus/optimistic-balances',
        version: '8.0.0',
        dependencies: { '@exodus/multi-account-redux': '~2.0.1' },
      })

      mockGetPaths.mockResolvedValue({
        '@exodus/multi-account-redux': mabDir,
        '@exodus/balances': balancesDir,
        '@exodus/optimistic-balances': optBalancesDir,
      })

      await versionPackagesExplicit({
        bumps: { '@exodus/multi-account-redux': 'major' },
        packages: [mabDir],
      })

      const balances = JSON.parse(fs.readFileSync(path.join(balancesDir, 'package.json'), 'utf8'))
      expect(balances.dependencies['@exodus/multi-account-redux']).toBe('^3.0.0')

      const opt = JSON.parse(fs.readFileSync(path.join(optBalancesDir, 'package.json'), 'utf8'))
      expect(opt.dependencies['@exodus/multi-account-redux']).toBe('~3.0.0')
    })

    it('stages every consumer package.json it touched, alongside the bumped one, into the release commit', async () => {
      const mabDir = writePackageJson('libraries/mab', {
        name: '@exodus/multi-account-redux',
        version: '2.1.1',
      })
      const balancesDir = writePackageJson('features/balances', {
        name: '@exodus/balances',
        version: '13.0.0',
        dependencies: { '@exodus/multi-account-redux': '^2.0.1' },
      })

      mockGetPaths.mockResolvedValue({
        '@exodus/multi-account-redux': mabDir,
        '@exodus/balances': balancesDir,
      })

      await versionPackagesExplicit({
        bumps: { '@exodus/multi-account-redux': 'major' },
        packages: [mabDir],
      })

      const addCalls = (spawnSync as unknown as jest.Mock).mock.calls.filter(
        (c) => c[0] === 'git' && c[1][0] === 'add'
      )
      const addedFiles = addCalls.map((c) => c[1][1])
      expect(addedFiles).toEqual(
        expect.arrayContaining([
          path.join(mabDir, 'package.json'),
          path.join(balancesDir, 'package.json'),
        ])
      )
    })

    it.each([
      ['workspace:*', 'workspace:*'],
      ['workspace:^', 'workspace:^'],
      ['npm:@scope/alias@^2.0.1', 'npm:@scope/alias@^2.0.1'],
      ['file:../local', 'file:../local'],
      ['link:../local', 'link:../local'],
      ['git+https://github.com/x/y.git', 'git+https://github.com/x/y.git'],
      ['*', '*'],
      ['latest', 'latest'],
    ])('leaves %s pins alone (no semver rewrite)', async (existingPin, expectedPin) => {
      const mabDir = writePackageJson('libraries/mab', {
        name: '@exodus/multi-account-redux',
        version: '2.1.1',
      })
      const consumerDir = writePackageJson('features/consumer', {
        name: '@exodus/consumer',
        version: '1.0.0',
        dependencies: { '@exodus/multi-account-redux': existingPin },
      })

      mockGetPaths.mockResolvedValue({
        '@exodus/multi-account-redux': mabDir,
        '@exodus/consumer': consumerDir,
      })

      await versionPackagesExplicit({
        bumps: { '@exodus/multi-account-redux': 'major' },
        packages: [mabDir],
      })

      const consumer = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8'))
      expect(consumer.dependencies['@exodus/multi-account-redux']).toBe(expectedPin)
    })

    it.each([['minor'], ['patch'], ['preminor'], ['prepatch'], ['prerelease']])(
      'leaves consumer pins alone on non-major bumps (%s)',
      async (bump) => {
        const mabDir = writePackageJson('libraries/mab', {
          name: '@exodus/multi-account-redux',
          version: '2.1.1',
        })
        const consumerDir = writePackageJson('features/consumer', {
          name: '@exodus/consumer',
          version: '1.0.0',
          dependencies: { '@exodus/multi-account-redux': '^2.0.1' },
        })

        mockGetPaths.mockResolvedValue({
          '@exodus/multi-account-redux': mabDir,
          '@exodus/consumer': consumerDir,
        })

        await versionPackagesExplicit({
          bumps: { '@exodus/multi-account-redux': bump },
          packages: [mabDir],
        })

        const consumer = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8'))
        expect(consumer.dependencies['@exodus/multi-account-redux']).toBe('^2.0.1')

        const addCalls = (spawnSync as unknown as jest.Mock).mock.calls.filter(
          (c) => c[0] === 'git' && c[1][0] === 'add'
        )
        const addedFiles = addCalls.map((c) => c[1][1])
        expect(addedFiles).not.toContain(path.join(consumerDir, 'package.json'))
      }
    )

    it('updates pins across dependencies, devDependencies, and peerDependencies', async () => {
      const mabDir = writePackageJson('libraries/mab', {
        name: '@exodus/multi-account-redux',
        version: '2.1.1',
      })
      const consumerDir = writePackageJson('features/consumer', {
        name: '@exodus/consumer',
        version: '1.0.0',
        dependencies: { '@exodus/multi-account-redux': '^2.0.1' },
        devDependencies: { '@exodus/multi-account-redux': '^2.0.1' },
        peerDependencies: { '@exodus/multi-account-redux': '^2.0.1' },
      })

      mockGetPaths.mockResolvedValue({
        '@exodus/multi-account-redux': mabDir,
        '@exodus/consumer': consumerDir,
      })

      await versionPackagesExplicit({
        bumps: { '@exodus/multi-account-redux': 'major' },
        packages: [mabDir],
      })

      const after = JSON.parse(fs.readFileSync(path.join(consumerDir, 'package.json'), 'utf8'))
      expect(after.dependencies['@exodus/multi-account-redux']).toBe('^3.0.0')
      expect(after.devDependencies['@exodus/multi-account-redux']).toBe('^3.0.0')
      expect(after.peerDependencies['@exodus/multi-account-redux']).toBe('^3.0.0')
    })
  })
})
