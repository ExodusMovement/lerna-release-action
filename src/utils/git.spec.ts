import { add, commit, resetLastCommit } from './git'

describe('add', () => {
  it('should throw when trying to use flags', () => {
    expect(() => add(['--force', '.yarnrc.yml'])).toThrow('Options are not allowed')
    expect(() => add(['--force', '.yarnrc.yml'])).toThrow('Options are not allowed')
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

describe('resetLastCommit', () => {
  it.each([['pathspecFileNul'], ['hard'], ['merge'], ['keep'], ['soft']])(
    'should throw when using non-whitelisted %s flag',
    (flag) => {
      expect(() => resetLastCommit({ flags: { [flag]: true } })).toThrow(
        'Only the following flags are allowed: mixed'
      )
    }
  )
})
