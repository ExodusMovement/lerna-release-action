import { Volume } from 'memfs/lib/volume'
import { exec } from './process'
import { updateLockfile } from './package-manager'

jest.mock('./process', () => ({
  __esModule: true,
  exec: jest.fn(),
}))

describe('updateLockfile', () => {
  let fs: Volume
  function setup(packageManager?: 'npm' | 'yarn', commandExists = true) {
    const filenames = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
    }

    ;(exec as jest.Mock).mockImplementation(async (command) => {
      if (!commandExists && command === `command -v ${packageManager}`) {
        throw new Error('some non-zero exit code from os')
      }
    })

    fs = Volume.fromJSON({
      [packageManager ? filenames[packageManager] : 'some-other-file.json']: 'some content',
    })
  }

  it('should call npm install if package-lock.json present', async () => {
    setup('npm')

    await updateLockfile({ filesystem: fs as never })

    expect(exec).toHaveBeenCalledWith('npm install')
  })

  it('should call yarn if yarn.lock present', async () => {
    setup('yarn')

    await updateLockfile({ filesystem: fs as never })

    expect(exec).toHaveBeenCalledWith('yarn --no-immutable')
  })

  it('should do nothing if no lockfile', async () => {
    setup()

    await updateLockfile({ filesystem: fs as never })

    expect(exec).not.toHaveBeenCalled()
  })
})
