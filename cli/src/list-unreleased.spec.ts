import { baselineTag, parsePrNumber, aggregateBumps } from './list-unreleased'

describe('baselineTag', () => {
  test('picks the highest tag at or below the package.json version, ignoring higher unrelated-lineage tags (guards the timer bug)', () => {
    // package is at 1.2.2; an old same-named package reached 4.0.2 — must not anchor there.
    expect(
      baselineTag('@x/timer', '1.2.2', [
        '@x/timer@1.2.0',
        '@x/timer@1.2.2',
        '@x/timer@3.4.3',
        '@x/timer@4.0.2',
      ])
    ).toBe('@x/timer@1.2.2')
  })

  test('falls back to the highest tag below the version when the exact one is missing (bumped, not yet tagged)', () => {
    expect(baselineTag('@x/p', '1.3.0', ['@x/p@1.2.0', '@x/p@1.2.2'])).toBe('@x/p@1.2.2')
  })

  test('orders prereleases within their cycle', () => {
    expect(
      baselineTag('@x/h', '5.0.0-rc.10', ['@x/h@5.0.0-rc.9', '@x/h@5.0.0-rc.10', '@x/h@4.0.0'])
    ).toBe('@x/h@5.0.0-rc.10')
  })

  test('ignores non-semver tags', () => {
    expect(baselineTag('@x/feat', '1.2.0', ['@x/feat@nightly', '@x/feat@1.2.0'])).toBe(
      '@x/feat@1.2.0'
    )
  })

  test('returns null when nothing was released at or below the version', () => {
    expect(baselineTag('@x/new', '1.0.0', ['@x/new@2.0.0'])).toBeNull()
    expect(baselineTag('@x/new', '1.0.0', ['@y/other@1.0.0'])).toBeNull()
  })

  test('does not match a different package sharing a name prefix', () => {
    expect(baselineTag('@x/foo', '1.0.0', ['@x/foobar@1.0.0'])).toBeNull()
  })
})

describe('parsePrNumber', () => {
  test('reads the trailing (#N) GitHub appends to a squash subject', () => {
    expect(parsePrNumber('feat(x): thing (#17280)')).toBe(17_280)
  })

  test('null when there is no PR ref', () => {
    expect(parsePrNumber('feat: a plain commit')).toBeNull()
  })

  test('only matches at the end, not a mid-message reference', () => {
    expect(parsePrNumber('fix: follow-up to (#5) regression')).toBeNull()
  })
})

describe('aggregateBumps', () => {
  // Mirrors the #17280 case: a feat commit touches only the plugin; the
  // config-churn commit that touches a leaf lib is a chore → lib excluded.
  const packagePaths = {
    '@x/plugin': 'lint/plugin',
    '@x/lib': 'libraries/lib',
  }

  test('attributes per commit by touched files, not PR-wide', () => {
    const bumps = aggregateBumps(
      [
        { sha: 'a', message: 'feat: add rule', files: ['lint/plugin/index.js'] },
        { sha: 'b', message: 'chore: churn config', files: ['libraries/lib/.eslintrc'] },
      ],
      packagePaths,
      'feat: port rules (#17280)'
    )
    expect(bumps).toEqual({ '@x/plugin': 'minor' })
  })

  test('takes the highest bump across a package’s commits', () => {
    const bumps = aggregateBumps(
      [
        { sha: 'a', message: 'fix: nit', files: ['lint/plugin/a.js'] },
        { sha: 'b', message: 'feat!: breaking', files: ['lint/plugin/b.js'] },
      ],
      packagePaths,
      'feat: x (#1)'
    )
    expect(bumps).toEqual({ '@x/plugin': 'major' })
  })

  test('ignores releasing commits that touch no workspace files', () => {
    expect(
      aggregateBumps(
        [{ sha: 'a', message: 'feat: ci', files: ['.github/x.yml'] }],
        packagePaths,
        'feat: x (#1)'
      )
    ).toEqual({})
  })

  test('falls back to the PR title when no individual commit is releasing', () => {
    const bumps = aggregateBumps(
      [
        { sha: 'a', message: 'wip', files: ['lint/plugin/a.js'] },
        { sha: 'b', message: 'address review', files: ['libraries/lib/b.js'] },
      ],
      packagePaths,
      'feat: shipped via non-conventional commits (#2)'
    )
    expect(bumps).toEqual({ '@x/plugin': 'minor', '@x/lib': 'minor' })
  })

  test('no fallback when the PR title is itself non-releasing', () => {
    expect(
      aggregateBumps(
        [{ sha: 'a', message: 'wip', files: ['lint/plugin/a.js'] }],
        packagePaths,
        'chore: cleanup (#3)'
      )
    ).toEqual({})
  })
})
