import { stringifyFlags } from './objects'

describe('objects', () => {
  describe('stringifyFlags', () => {
    it('should stringify multiple flags', () => {
      expect(stringifyFlags({ ff: true, noEdit: false, forceWithLease: true })).toEqual(
        '--ff --force-with-lease'
      )
    })

    it('should stringify a single flag', () => {
      expect(stringifyFlags({ forceWithLease: true })).toEqual('--force-with-lease')
    })

    it('should stringify no flags', () => {
      expect(stringifyFlags({ forceWithLease: false })).toEqual('')
      expect(stringifyFlags({})).toEqual('')
    })
  })
})
