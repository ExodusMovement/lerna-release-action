import { unique } from './arrays'

describe('unique', () => {
  it('should remove duplicates', () => {
    const actual = unique([
      '@exodus/networking-node@1.0.12',
      '@exodus/networking-node@1.0.12',
      'wayne-foundation',
    ])
    const expected = ['@exodus/networking-node@1.0.12', 'wayne-foundation']

    expect(actual).toEqual(expected)
  })
})
