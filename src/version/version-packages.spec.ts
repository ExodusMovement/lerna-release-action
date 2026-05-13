import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import versionPackages, { versionPackagesExplicit } from './version-packages'
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

describe('versionPackagesExplicit', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'version-packages-explicit-'))
    ;(spawnSync as unknown as jest.Mock).mockClear()
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

  it('bumps the version field in place via semver.inc, leaves the rest of package.json untouched', () => {
    const pkgDir = writePackageJson('mab', {
      name: '@exodus/multi-account-redux',
      version: '2.1.1',
      dependencies: { lodash: '^4.17.21' },
    })

    const count = versionPackagesExplicit({
      bumps: { '@exodus/multi-account-redux': 'major' },
      packages: [pkgDir],
    })

    expect(count).toBe(1)
    const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    expect(after.version).toBe('3.0.0')
    expect(after.dependencies).toEqual({ lodash: '^4.17.21' })
  })

  it('tolerates `workspace:*` devDeps without invoking npm (regression: npm rejects workspace: protocol)', () => {
    const pkgDir = writePackageJson('mab', {
      name: '@exodus/multi-account-redux',
      version: '2.1.1',
      dependencies: { '@exodus/basic-utils': '^5.0.0' },
      devDependencies: {
        '@exodus/assets-feature': 'workspace:*',
        '@exodus/wallet-accounts': 'workspace:*',
      },
    })

    expect(() =>
      versionPackagesExplicit({
        bumps: { '@exodus/multi-account-redux': 'major' },
        packages: [pkgDir],
      })
    ).not.toThrow()

    const after = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    expect(after.version).toBe('3.0.0')
    expect(after.devDependencies).toEqual({
      '@exodus/assets-feature': 'workspace:*',
      '@exodus/wallet-accounts': 'workspace:*',
    })

    const calls = (spawnSync as unknown as jest.Mock).mock.calls.map((c) => c[0])
    expect(calls).not.toContain('npm')
  })

  it('creates one git commit + annotated tag per bumps entry', () => {
    const mabDir = writePackageJson('mab', { name: '@exodus/mab', version: '1.0.0' })
    const balancesDir = writePackageJson('balances', { name: '@exodus/balances', version: '2.5.0' })

    versionPackagesExplicit({
      bumps: { '@exodus/mab': 'major', '@exodus/balances': 'patch' },
      packages: [mabDir, balancesDir],
    })

    const gitCalls = (spawnSync as unknown as jest.Mock).mock.calls.filter((c) => c[0] === 'git')
    const tagCalls = gitCalls.filter((c) => c[1][0] === 'tag')
    expect(tagCalls.map((c) => c[1][2])).toEqual(['@exodus/mab@2.0.0', '@exodus/balances@2.5.1'])

    const commitCalls = gitCalls.filter((c) => c[1][0] === 'commit')
    expect(commitCalls).toHaveLength(2)
  })

  it("throws when a bump's package name is not in `packages`", () => {
    const pkgDir = writePackageJson('mab', { name: '@exodus/mab', version: '1.0.0' })

    expect(() =>
      versionPackagesExplicit({
        bumps: { '@exodus/not-here': 'major' },
        packages: [pkgDir],
      })
    ).toThrow(/not present in `packages`/)
  })

  it('throws when semver.inc rejects the bump level', () => {
    const pkgDir = writePackageJson('mab', { name: '@exodus/mab', version: '1.0.0' })

    expect(() =>
      versionPackagesExplicit({
        bumps: { '@exodus/mab': 'not-a-bump' },
        packages: [pkgDir],
      })
    ).toThrow(/semver\.inc rejected bump/)
  })
})
