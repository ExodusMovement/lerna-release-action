import { flagsAsArguments } from './objects'

describe('objects', () => {
  describe('stringifyFlags', () => {
    it('should stringify multiple flags', () => {
      expect(
        flagsAsArguments({ ff: true, noEdit: false, forceWithLease: true }, [
          'ff',
          'noEdit',
          'forceWithLease',
        ])
      ).toEqual(['--ff', '--force-with-lease'])
    })

    it('should stringify a single flag', () => {
      expect(flagsAsArguments({ forceWithLease: true }, ['forceWithLease'])).toEqual([
        '--force-with-lease',
      ])
    })

    it('should stringify no flags', () => {
      expect(flagsAsArguments({ forceWithLease: false }, ['forceWithLease'])).toEqual([])
      expect(flagsAsArguments({}, [])).toEqual([])
    })
  })
})
