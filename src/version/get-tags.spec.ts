import { when } from 'jest-when'
import getTags from './get-tags'
import { exec } from '../utils/process'

jest.mock('../utils/process', () => ({
  exec: jest.fn(),
}))

function setup(tags: string[]) {
  const commit = '26d0f601ef58b14de321cad15b059fe2962b37f5'

  when(exec)
    .calledWith('git rev-parse HEAD')
    .mockResolvedValue({ stdout: commit, stderr: '' })
    .calledWith(`git tag --contains ${commit}`)
    .mockResolvedValue({ stdout: tags.join('\n'), stderr: '' })
}

describe('getTags', () => {
  it('should only return tags from selected packages', async () => {
    setup([
      '@exodus/batcave-entrance@v2.0.1',
      '@exodus/batcave@v1.0.1',
      '@exodus/wayne-manor@v3.0.1',
    ])

    const selected = ['modules/batcave', 'libraries/batcave-entrance']
    await expect(getTags(selected)).resolves.toEqual([
      '@exodus/batcave@v1.0.1',
      '@exodus/batcave-entrance@v2.0.1',
    ])
  })

  it('should return tags sorted by package order', async () => {
    setup([
      '@exodus/batcave-formatting@v2.0.1',
      '@exodus/batcave@v1.0.1',
      '@exodus/wayne-tower@v1.0.1',
      '@exodus/wayne-manor@v3.0.1',
    ])

    const selected = [
      'modules/wayne-manor',
      'libraries/wayne-tower',
      'modules/batcave',
      'libraries/batcave-formatting',
    ]
    await expect(getTags(selected)).resolves.toEqual([
      '@exodus/wayne-manor@v3.0.1',
      '@exodus/wayne-tower@v1.0.1',
      '@exodus/batcave@v1.0.1',
      '@exodus/batcave-formatting@v2.0.1',
    ])
  })
})
