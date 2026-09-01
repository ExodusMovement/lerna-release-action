import {
  isValidSemVer,
  parseSemVer,
  formatSemVer,
  compareSemVer,
  sortSemVer,
  getHighestVersion,
  getLowestVersion,
  bumpVersion,
  satisfiesGte,
  satisfiesLt,
  isPrerelease,
  extractVersionFromTag,
  getStableVersions,
  getPrereleaseVersions,
  getPrereleaseIdentifier,
} from './semver'

describe('isValidSemVer', () => {
  it('should accept valid semantic versions', () => {
    expect(isValidSemVer('1.0.0')).toBe(true)
    expect(isValidSemVer('0.0.1')).toBe(true)
    expect(isValidSemVer('10.20.30')).toBe(true)
    expect(isValidSemVer('v1.0.0')).toBe(true)
  })

  it('should accept versions with prerelease identifiers', () => {
    expect(isValidSemVer('1.0.0-alpha')).toBe(true)
    expect(isValidSemVer('1.0.0-alpha.1')).toBe(true)
    expect(isValidSemVer('1.0.0-0.3.7')).toBe(true)
    expect(isValidSemVer('1.0.0-x.7.z.92')).toBe(true)
  })

  it('should accept versions with build metadata', () => {
    expect(isValidSemVer('1.0.0+build')).toBe(true)
    expect(isValidSemVer('1.0.0+build.123')).toBe(true)
    expect(isValidSemVer('1.0.0-alpha+build')).toBe(true)
  })

  it('should reject invalid versions', () => {
    expect(isValidSemVer('')).toBe(false)
    expect(isValidSemVer('1')).toBe(false)
    expect(isValidSemVer('1.0')).toBe(false)
    expect(isValidSemVer('a.b.c')).toBe(false)
    expect(isValidSemVer('1.0.0.0')).toBe(false)
  })

  it('should reject non-string inputs', () => {
    expect(isValidSemVer(null as unknown as string)).toBe(false)
    expect(isValidSemVer(undefined as unknown as string)).toBe(false)
  })
})

describe('parseSemVer', () => {
  it('should parse simple versions', () => {
    const result = parseSemVer('1.2.3')
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: [],
    })
  })

  it('should parse versions with v prefix', () => {
    const result = parseSemVer('v1.2.3')
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: [],
    })
  })

  it('should parse versions with prerelease', () => {
    const result = parseSemVer('1.2.3-alpha.1')
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['alpha', '1'],
      build: [],
    })
  })

  it('should parse versions with build metadata', () => {
    const result = parseSemVer('1.2.3+build.456')
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: ['build', '456'],
    })
  })

  it('should parse versions with both prerelease and build', () => {
    const result = parseSemVer('1.2.3-beta.2+build.789')
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['beta', '2'],
      build: ['build', '789'],
    })
  })

  it('should throw for invalid versions', () => {
    expect(() => parseSemVer('invalid')).toThrow('Invalid semantic version: invalid')
  })
})

describe('formatSemVer', () => {
  it('should format simple versions', () => {
    const version = { major: 1, minor: 2, patch: 3, prerelease: [], build: [] }
    expect(formatSemVer(version)).toBe('1.2.3')
  })

  it('should format with v prefix when requested', () => {
    const version = { major: 1, minor: 2, patch: 3, prerelease: [], build: [] }
    expect(formatSemVer(version, true)).toBe('v1.2.3')
  })

  it('should format with prerelease', () => {
    const version = { major: 1, minor: 2, patch: 3, prerelease: ['alpha', '1'], build: [] }
    expect(formatSemVer(version)).toBe('1.2.3-alpha.1')
  })

  it('should format with build metadata', () => {
    const version = { major: 1, minor: 2, patch: 3, prerelease: [], build: ['build', '456'] }
    expect(formatSemVer(version)).toBe('1.2.3+build.456')
  })
})

describe('compareSemVer', () => {
  it('should compare major versions', () => {
    expect(compareSemVer('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareSemVer('1.0.0', '2.0.0')).toBeLessThan(0)
  })

  it('should compare minor versions', () => {
    expect(compareSemVer('1.2.0', '1.1.0')).toBeGreaterThan(0)
    expect(compareSemVer('1.1.0', '1.2.0')).toBeLessThan(0)
  })

  it('should compare patch versions', () => {
    expect(compareSemVer('1.0.2', '1.0.1')).toBeGreaterThan(0)
    expect(compareSemVer('1.0.1', '1.0.2')).toBeLessThan(0)
  })

  it('should return 0 for equal versions', () => {
    expect(compareSemVer('1.2.3', '1.2.3')).toBe(0)
  })

  it('should rank prerelease lower than stable', () => {
    expect(compareSemVer('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0)
    expect(compareSemVer('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
  })

  it('should compare prerelease versions', () => {
    expect(compareSemVer('1.0.0-alpha.2', '1.0.0-alpha.1')).toBeGreaterThan(0)
    expect(compareSemVer('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0)
  })

  it('should rank numeric prerelease identifiers lower', () => {
    expect(compareSemVer('1.0.0-alpha', '1.0.0-1')).toBeGreaterThan(0)
  })
})

describe('sortSemVer', () => {
  it('should sort versions in ascending order by default', () => {
    const versions = ['2.0.0', '1.0.0', '1.5.0', '1.0.1']
    expect(sortSemVer(versions)).toEqual(['1.0.0', '1.0.1', '1.5.0', '2.0.0'])
  })

  it('should sort versions in descending order when specified', () => {
    const versions = ['2.0.0', '1.0.0', '1.5.0', '1.0.1']
    expect(sortSemVer(versions, true)).toEqual(['2.0.0', '1.5.0', '1.0.1', '1.0.0'])
  })

  it('should handle prerelease versions', () => {
    const versions = ['1.0.0', '1.0.0-alpha', '1.0.0-beta']
    expect(sortSemVer(versions)).toEqual(['1.0.0-alpha', '1.0.0-beta', '1.0.0'])
  })

  it('should not mutate the original array', () => {
    const versions = ['2.0.0', '1.0.0']
    sortSemVer(versions)
    expect(versions).toEqual(['2.0.0', '1.0.0'])
  })
})

describe('getHighestVersion', () => {
  it('should return the highest version', () => {
    expect(getHighestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0')
  })

  it('should return undefined for empty array', () => {
    expect(getHighestVersion([])).toBeUndefined()
  })
})

describe('getLowestVersion', () => {
  it('should return the lowest version', () => {
    expect(getLowestVersion(['1.0.0', '2.0.0', '0.5.0'])).toBe('0.5.0')
  })

  it('should return undefined for empty array', () => {
    expect(getLowestVersion([])).toBeUndefined()
  })
})

describe('bumpVersion', () => {
  it('should bump major version', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  it('should bump minor version', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
  })

  it('should bump patch version', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('should create premajor version', () => {
    expect(bumpVersion('1.2.3', 'premajor')).toBe('2.0.0-alpha.0')
    expect(bumpVersion('1.2.3', 'premajor', 'beta')).toBe('2.0.0-beta.0')
  })

  it('should create preminor version', () => {
    expect(bumpVersion('1.2.3', 'preminor')).toBe('1.3.0-alpha.0')
  })

  it('should create prepatch version', () => {
    expect(bumpVersion('1.2.3', 'prepatch')).toBe('1.2.4-alpha.0')
  })

  it('should increment prerelease', () => {
    expect(bumpVersion('1.0.0-alpha.0', 'prerelease')).toBe('1.0.0-alpha.1')
    expect(bumpVersion('1.0.0-alpha.5', 'prerelease')).toBe('1.0.0-alpha.6')
  })

  it('should add prerelease to stable version', () => {
    expect(bumpVersion('1.0.0', 'prerelease')).toBe('1.0.1-alpha.0')
  })

  it('should clear prerelease when bumping major/minor/patch', () => {
    expect(bumpVersion('1.0.0-alpha.1', 'patch')).toBe('1.0.1')
    expect(bumpVersion('1.0.0-alpha.1', 'minor')).toBe('1.1.0')
    expect(bumpVersion('1.0.0-alpha.1', 'major')).toBe('2.0.0')
  })
})

describe('satisfiesGte', () => {
  it('should return true when version >= minimum', () => {
    expect(satisfiesGte('2.0.0', '1.0.0')).toBe(true)
    expect(satisfiesGte('1.0.0', '1.0.0')).toBe(true)
  })

  it('should return false when version < minimum', () => {
    expect(satisfiesGte('1.0.0', '2.0.0')).toBe(false)
  })
})

describe('satisfiesLt', () => {
  it('should return true when version < maximum', () => {
    expect(satisfiesLt('1.0.0', '2.0.0')).toBe(true)
  })

  it('should return false when version >= maximum', () => {
    expect(satisfiesLt('2.0.0', '1.0.0')).toBe(false)
    expect(satisfiesLt('1.0.0', '1.0.0')).toBe(false)
  })
})

describe('isPrerelease', () => {
  it('should return true for prerelease versions', () => {
    expect(isPrerelease('1.0.0-alpha')).toBe(true)
    expect(isPrerelease('1.0.0-beta.1')).toBe(true)
  })

  it('should return false for stable versions', () => {
    expect(isPrerelease('1.0.0')).toBe(false)
    expect(isPrerelease('1.0.0+build')).toBe(false)
  })
})

describe('extractVersionFromTag', () => {
  it('should extract version from scoped package tags', () => {
    expect(extractVersionFromTag('@exodus/storage-spec@1.0.12')).toBe('1.0.12')
    expect(extractVersionFromTag('@scope/package@2.1.0-beta.1')).toBe('2.1.0-beta.1')
  })

  it('should extract version from unscoped package tags', () => {
    expect(extractVersionFromTag('lodash@4.17.21')).toBe('4.17.21')
  })

  it('should extract version from v-prefixed tags', () => {
    expect(extractVersionFromTag('v1.2.3')).toBe('1.2.3')
  })

  it('should extract bare versions', () => {
    expect(extractVersionFromTag('1.2.3')).toBe('1.2.3')
  })

  it('should return undefined for invalid tags', () => {
    expect(extractVersionFromTag('not-a-version')).toBeUndefined()
    expect(extractVersionFromTag('')).toBeUndefined()
  })
})

describe('getStableVersions', () => {
  it('should filter out prerelease versions', () => {
    const versions = ['1.0.0', '1.0.0-alpha', '2.0.0', '2.0.0-beta.1']
    expect(getStableVersions(versions)).toEqual(['1.0.0', '2.0.0'])
  })
})

describe('getPrereleaseVersions', () => {
  it('should return only prerelease versions', () => {
    const versions = ['1.0.0', '1.0.0-alpha', '2.0.0', '2.0.0-beta.1']
    expect(getPrereleaseVersions(versions)).toEqual(['1.0.0-alpha', '2.0.0-beta.1'])
  })
})

describe('getPrereleaseIdentifier', () => {
  it('should extract prerelease identifier', () => {
    expect(getPrereleaseIdentifier('1.0.0-alpha.1')).toBe('alpha')
    expect(getPrereleaseIdentifier('1.0.0-beta.2')).toBe('beta')
    expect(getPrereleaseIdentifier('1.0.0-rc.1')).toBe('rc')
  })

  it('should return undefined for stable versions', () => {
    expect(getPrereleaseIdentifier('1.0.0')).toBeUndefined()
  })

  it('should handle numeric-only prereleases', () => {
    expect(getPrereleaseIdentifier('1.0.0-0.1')).toBeUndefined()
  })
})
