import { when } from 'jest-when'
import getTags from './get-tags'
import { spawnSync } from 'child_process'

jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}))

describe('getTags', () => {
  function setup(tags: string[]) {
    const commit = '26d0f601ef58b14de321cad15b059fe2962b37f5'

    when(spawnSync)
      .calledWith('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
      .mockReturnValue({ stdout: commit, stderr: '', status: 0 } as never)
      .calledWith('git', ['tag', '--contains', commit], { encoding: 'utf8' })
      .mockReturnValue({ stdout: tags.join('\n'), stderr: '', status: 0 } as never)
  }

  it('should only return tags from selected packages', () => {
    setup([
      '@exodus/batcave-entrance@v2.0.1',
      '@exodus/batcave@v1.0.1',
      '@exodus/wayne-manor@v3.0.1',
    ])

    const selected = ['modules/batcave', 'libraries/batcave-entrance']
    expect(getTags(selected)).toEqual(['@exodus/batcave@v1.0.1', '@exodus/batcave-entrance@v2.0.1'])
  })

  it('should return tags sorted by package order', () => {
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
    expect(getTags(selected)).toEqual([
      '@exodus/wayne-manor@v3.0.1',
      '@exodus/wayne-tower@v1.0.1',
      '@exodus/batcave@v1.0.1',
      '@exodus/batcave-formatting@v2.0.1',
    ])
  })
})
