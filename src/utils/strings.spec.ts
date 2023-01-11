import { truncate } from './strings'

describe('truncate', () => {
  it('should keep full words split by punctuation', () => {
    const result = truncate(
      'chore: release networking-browser,networking-common,networking-mobile,networking-node,networking-spec',
      50
    )
    expect(result).toEqual('chore: release networking-browser...')
  })

  it('should keep full words split by white space', () => {
    const result = truncate(
      'I am Bruce Wayne and at night I like to go out and dress differently.',
      60
    )
    expect(result).toEqual('I am Bruce Wayne and at night I like to go out and dress...')
  })

  it('should return full text when exceeding maxLen', () => {
    const result = truncate('Hallo', 999)
    expect(result).toEqual('Hallo')
  })

  it('should return ellipsis for one word that exceeds maxLen', () => {
    const result = truncate('Hallo', 4)
    expect(result).toEqual('...')
  })

  it('should truncate ellipsis that exceeds maxLen', () => {
    const result = truncate('Hallo', 2)
    expect(result).toEqual('..')
  })
})
