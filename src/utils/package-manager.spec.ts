import { Volume } from 'memfs/lib/volume'
import { updateLockfile } from './package-manager'
import { createFsFromJSON } from './testing'
import { spawnSync } from 'child_process'

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}))

describe('updateLockfile', () => {
  let fs: Volume

  function setup(packageManager?: 'npm' | 'yarn' | 'pnpm', extraFiles: Record<string, string> = {}) {
    const filenames = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
    }

    ;(spawnSync as jest.Mock).mockImplementation(() => {
      return {
        status: 0,
      }
    })

    fs = createFsFromJSON({
      [packageManager ? filenames[packageManager] : 'some-other-file.json']: 'some content',
      ...extraFiles,
    })
  }

  it('should call npm install if package-lock.json present', () => {
    setup('npm')

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith('npm', ['install'], expect.anything())
  })

  it('should call yarn if yarn.lock present', () => {
    setup('yarn')

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith('yarn', ['--no-immutable'], expect.anything())
  })

  it('should call pnpm install if pnpm-lock.yaml present', () => {
    setup('pnpm')

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--frozen-lockfile', 'false'],
      expect.anything()
    )
  })

  it('should prefer packageManager from package.json over other lockfiles', () => {
    setup('pnpm', {
      'package.json': JSON.stringify({ packageManager: 'pnpm@10.32.1' }),
      'yarn.lock': 'some content',
    })

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--frozen-lockfile', 'false'],
      expect.anything()
    )
  })

  it('should prefer npmClient from lerna.json over other lockfiles', () => {
    setup('pnpm', {
      'lerna.json': JSON.stringify({ npmClient: 'pnpm' }),
      'yarn.lock': 'some content',
    })

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--frozen-lockfile', 'false'],
      expect.anything()
    )
  })

  it('should throw if package manager cannot be detected', () => {
    setup()

    expect(() => updateLockfile({ filesystem: fs as never })).toThrow(
      'Unable to determine package manager: expected packageManager/npmClient or a supported lockfile.'
    )
  })

  it('should use configured package manager even if no lockfile exists', () => {
    setup(undefined, {
      'package.json': JSON.stringify({ packageManager: 'pnpm@10.32.1' }),
    })

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      ['install', '--frozen-lockfile', 'false'],
      expect.anything()
    )
  })
})
