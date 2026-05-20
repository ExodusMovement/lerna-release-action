import { bumpFromMessage, maxBump, BUMP_NONE, BUMP_PATCH, BUMP_MINOR, BUMP_MAJOR } from './bumps'

describe('bumpFromMessage', () => {
  test.each([
    ['feat!: drop subpath', BUMP_MAJOR],
    ['feat(scope)!: drop subpath', BUMP_MAJOR],
    ['feat: new helper', BUMP_MINOR],
    ['feat(scope): new helper', BUMP_MINOR],
    ['fix: nil deref', BUMP_PATCH],
    ['perf: tighten loop', BUMP_PATCH],
    ['refactor: rename var', BUMP_NONE],
    ['chore: bump deps', BUMP_NONE],
    ['docs: update readme', BUMP_NONE],
    ['style: re-indent', BUMP_NONE],
    ['test: add coverage', BUMP_NONE],
    ['', BUMP_NONE],
    ['no conventional prefix', BUMP_NONE],
  ])('%s -> %s', (input, expected) => {
    expect(bumpFromMessage(input)).toBe(expected)
  })

  test('BREAKING CHANGE footer promotes to major', () => {
    const msg = 'feat: add knob\n\nBody.\n\nBREAKING CHANGE: renames .foo to .bar'
    expect(bumpFromMessage(msg)).toBe(BUMP_MAJOR)
  })

  test('BREAKING-CHANGE alias promotes to major', () => {
    expect(bumpFromMessage('fix: x\n\nBREAKING-CHANGE: removes legacy export')).toBe(BUMP_MAJOR)
  })

  test('non-string input returns none', () => {
    expect(bumpFromMessage(undefined)).toBe(BUMP_NONE)
    expect(bumpFromMessage(null)).toBe(BUMP_NONE)
    expect(bumpFromMessage(42)).toBe(BUMP_NONE)
  })
})

describe('maxBump', () => {
  test('keeps the higher rank', () => {
    expect(maxBump(BUMP_NONE, BUMP_PATCH)).toBe(BUMP_PATCH)
    expect(maxBump(BUMP_PATCH, BUMP_MINOR)).toBe(BUMP_MINOR)
    expect(maxBump(BUMP_MINOR, BUMP_MAJOR)).toBe(BUMP_MAJOR)
    expect(maxBump(BUMP_MAJOR, BUMP_PATCH)).toBe(BUMP_MAJOR)
  })
})
