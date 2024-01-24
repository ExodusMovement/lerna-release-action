import { Volume } from 'memfs/lib/volume'
import { updateLockfile } from './package-manager'
import { createFsFromJSON } from './testing'
import { spawnSync } from 'child_process'

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}))

describe('updateLockfile', () => {
  let fs: Volume

  function setup(packageManager?: 'npm' | 'yarn', commandExists = true) {
    const filenames = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
    }

    ;(spawnSync as jest.Mock).mockImplementation((command) => {
      if (!commandExists && command === `command -v ${packageManager}`) {
        throw new Error('some non-zero exit code from os')
      }
    })

    fs = createFsFromJSON({
      [packageManager ? filenames[packageManager] : 'some-other-file.json']: 'some content',
    })
  }

  it('should call npm install if package-lock.json present', () => {
    setup('npm')

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith('npm', ['install'])
  })

  it('should call yarn if yarn.lock present', () => {
    setup('yarn')

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).toHaveBeenCalledWith('yarn', ['--no-immutable'])
  })

  it('should do nothing if no lockfile', () => {
    setup()

    updateLockfile({ filesystem: fs as never })

    expect(spawnSync).not.toHaveBeenCalled()
  })
})
