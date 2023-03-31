import { joinNatural, unique } from './arrays'

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

describe('joinNatural', () => {
  it('should create an enumeration as common in natural language', () => {
    expect(joinNatural(['Harry Potter', 'Neville Longbottom', 'Draco Malfoy'])).toEqual(
      'Harry Potter, Neville Longbottom, and Draco Malfoy'
    )
  })

  it('should return one element as is', () => {
    expect(joinNatural(['Harry Potter'])).toEqual('Harry Potter')
  })

  it('should combine two elements with an and', () => {
    expect(joinNatural(['Harry Potter', 'His Big Wand'])).toEqual('Harry Potter, and His Big Wand')
  })
})
