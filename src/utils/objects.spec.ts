import { flagsAsArguments } from './objects'

describe('objects', () => {
  describe('stringifyFlags', () => {
    it('should stringify multiple flags', () => {
      expect(flagsAsArguments({ ff: true, noEdit: false, forceWithLease: true })).toEqual([
        '--ff',
        '--force-with-lease',
      ])
    })

    it('should stringify a single flag', () => {
      expect(flagsAsArguments({ forceWithLease: true })).toEqual(['--force-with-lease'])
    })

    it('should stringify no flags', () => {
      expect(flagsAsArguments({ forceWithLease: false })).toEqual([])
      expect(flagsAsArguments({})).toEqual([])
    })
  })
})
