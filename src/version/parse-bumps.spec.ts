import { parseBumps } from './parse-bumps'

describe('parseBumps', () => {
  test('returns undefined for empty / whitespace input', () => {
    expect(parseBumps(undefined)).toBeUndefined()
    expect(parseBumps('')).toBeUndefined()
    expect(parseBumps('   ')).toBeUndefined()
  })

  test('returns undefined for an empty JSON object', () => {
    expect(parseBumps('{}')).toBeUndefined()
  })

  test('parses a valid map', () => {
    expect(parseBumps('{"@scope/a":"major","@scope/b":"patch"}')).toEqual({
      '@scope/a': 'major',
      '@scope/b': 'patch',
    })
  })

  test('accepts every supported bump level', () => {
    const all = JSON.stringify({
      a: 'major',
      b: 'minor',
      c: 'patch',
      d: 'premajor',
      e: 'preminor',
      f: 'prepatch',
      g: 'prerelease',
    })
    expect(parseBumps(all)).toBeDefined()
  })

  test('throws on malformed JSON', () => {
    expect(() => parseBumps('not-json')).toThrow(/Failed to parse `bumps`/)
  })

  test('throws on non-object JSON', () => {
    expect(() => parseBumps('"feat!"')).toThrow(/must be a JSON object/)
    expect(() => parseBumps('[]')).toThrow(/must be a JSON object/)
    expect(() => parseBumps('null')).toThrow(/must be a JSON object/)
  })

  test('throws on unknown bump level', () => {
    expect(() => parseBumps('{"a":"hotfix"}')).toThrow(/Invalid bump "hotfix"/)
  })

  test('throws when a bump is not a string', () => {
    expect(() => parseBumps('{"a":42}')).toThrow(/Invalid bump "42"/)
  })
})
