import * as process from './process'
import { add, commit, getChangedFiles, resetCommits } from './git'

describe('add', () => {
  it('should allow valid paths', () => {
    expect(() => add(['./some-path', 'package.json'])).not.toThrow('Options are not allowed')
    expect(() => add(['/some-absolute-path'])).not.toThrow('Options are not allowed')
  })

  it('should throw when trying to use flags', () => {
    expect(() => add(['--force', '.yarnrc.yml'])).toThrow('Options are not allowed')
    expect(() => add(['--force', '.yarnrc.yml'])).toThrow('Options are not allowed')
  })

  it('should throw trying to hide flags', () => {
    expect(() => add(['``--force', '.yarnrc.yml'])).toThrow('Options are not allowed')
    expect(() => add(['${}--force', '.yarnrc.yml'])).toThrow('Options are not allowed')
  })
})

describe('commit', () => {
  it.each([
    ['verbose'],
    ['dryRun'],
    ['force'],
    ['patch'],
    ['sparse'],
    ['edit'],
    ['ignoreErrors'],
    ['interactive'],
    ['renormalize'],
    ['refresh'],
    ['ignoreMissing'],
    ['ignoreRemoval'],
  ])('should throw when using non-whitelisted %s flag', (flag) => {
    expect(() =>
      commit({ message: 'feat: taking all your crypto', flags: { [flag]: true } as never })
    ).toThrow('Only the following flags are allowed: amend, all, noEdit')
  })
})

describe('resetCommits', () => {
  it.each([['pathspecFileNul'], ['hard'], ['merge'], ['keep'], ['soft']])(
    'should throw when using non-whitelisted %s flag',
    (flag) => {
      expect(() => resetCommits({ flags: { [flag]: true } })).toThrow(
        'Only the following flags are allowed: mixed'
      )
    }
  )

  it('resets HEAD~1 by default', () => {
    const spy = jest.spyOn(process, 'spawnSync').mockReturnValue('')
    try {
      resetCommits({ flags: { mixed: true } })
      expect(spy).toHaveBeenCalledWith('git', ['reset', '--mixed', 'HEAD~1'])
    } finally {
      spy.mockRestore()
    }
  })

  it('resets HEAD~<count> when count is supplied', () => {
    const spy = jest.spyOn(process, 'spawnSync').mockReturnValue('')
    try {
      resetCommits({ flags: { mixed: true }, count: 3 })
      expect(spy).toHaveBeenCalledWith('git', ['reset', '--mixed', 'HEAD~3'])
    } finally {
      spy.mockRestore()
    }
  })
})

describe('getChangedFiles', () => {
  it('diffs added/modified files between two commits, excluding deletions', () => {
    const spy = jest
      .spyOn(process, 'spawnSync')
      .mockReturnValue('pkg/a/package.json\0pkg/b/CHANGELOG.md\0')
    try {
      const files = getChangedFiles('base-sha', 'head-sha')
      expect(spy).toHaveBeenCalledWith('git', [
        'diff',
        '--no-relative',
        '--name-only',
        '-z',
        '--diff-filter=d',
        'base-sha',
        'head-sha',
      ])
      expect(files).toEqual(['pkg/a/package.json', 'pkg/b/CHANGELOG.md'])
    } finally {
      spy.mockRestore()
    }
  })

  it('returns an empty list when nothing changed', () => {
    const spy = jest.spyOn(process, 'spawnSync').mockReturnValue('')
    try {
      expect(getChangedFiles('base-sha', 'head-sha')).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })
})
