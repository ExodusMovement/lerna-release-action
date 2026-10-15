/**
 * Semantic versioning utilities for lerna release action
 */

/**
 * Represents a parsed semantic version
 */
export interface SemVer {
  major: number
  minor: number
  patch: number
  prerelease: string[]
  build: string[]
}

/**
 * Pattern for matching semantic version strings
 */
const SEMVER_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

/**
 * Validates that a string is a valid semantic version
 */
export function isValidSemVer(version: string): boolean {
  if (!version || typeof version !== 'string') {
    return false
  }

  return SEMVER_PATTERN.test(version)
}

/**
 * Parses a semantic version string into its components
 * @throws Error if the version string is invalid
 */
export function parseSemVer(version: string): SemVer {
  const match = version.match(SEMVER_PATTERN)

  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`)
  }

  const [, major, minor, patch, prerelease, build] = match

  return {
    major: parseInt(major!, 10),
    minor: parseInt(minor!, 10),
    patch: parseInt(patch!, 10),
    prerelease: prerelease ? prerelease.split('.') : [],
    build: build ? build.split('.') : [],
  }
}

/**
 * Formats a SemVer object back to a string
 */
export function formatSemVer(version: SemVer, includeV = false): string {
  let result = `${version.major}.${version.minor}.${version.patch}`

  if (version.prerelease.length > 0) {
    result += `-${version.prerelease.join('.')}`
  }

  if (version.build.length > 0) {
    result += `+${version.build.join('.')}`
  }

  return includeV ? `v${result}` : result
}

/**
 * Compares two semantic versions
 * @returns negative if a < b, 0 if a == b, positive if a > b
 */
export function compareSemVer(a: string, b: string): number {
  const versionA = parseSemVer(a)
  const versionB = parseSemVer(b)

  // Compare major.minor.patch
  if (versionA.major !== versionB.major) {
    return versionA.major - versionB.major
  }

  if (versionA.minor !== versionB.minor) {
    return versionA.minor - versionB.minor
  }

  if (versionA.patch !== versionB.patch) {
    return versionA.patch - versionB.patch
  }

  // Prerelease versions have lower precedence than normal versions
  if (versionA.prerelease.length === 0 && versionB.prerelease.length > 0) {
    return 1
  }

  if (versionA.prerelease.length > 0 && versionB.prerelease.length === 0) {
    return -1
  }

  // Compare prerelease identifiers
  const maxLen = Math.max(versionA.prerelease.length, versionB.prerelease.length)
  for (let i = 0; i < maxLen; i++) {
    const identA = versionA.prerelease[i]
    const identB = versionB.prerelease[i]

    // Fewer fields means lower precedence
    if (identA === undefined) return -1
    if (identB === undefined) return 1

    // Numeric identifiers have lower precedence than alphanumeric
    const numA = parseInt(identA, 10)
    const numB = parseInt(identB, 10)
    const isNumA = !isNaN(numA)
    const isNumB = !isNaN(numB)

    if (isNumA && isNumB) {
      if (numA !== numB) return numA - numB
    } else if (isNumA) {
      return -1
    } else if (isNumB) {
      return 1
    } else {
      const cmp = identA.localeCompare(identB)
      if (cmp !== 0) return cmp
    }
  }

  return 0
}

/**
 * Sorts an array of semantic version strings
 */
export function sortSemVer(versions: string[], descending = false): string[] {
  const sorted = [...versions].sort(compareSemVer)
  return descending ? sorted.reverse() : sorted
}

/**
 * Gets the highest version from an array of versions
 */
export function getHighestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined

  const sorted = sortSemVer(versions, true)
  return sorted[0]
}

/**
 * Gets the lowest version from an array of versions
 */
export function getLowestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined

  const sorted = sortSemVer(versions)
  return sorted[0]
}

export type BumpType = 'major' | 'minor' | 'patch' | 'premajor' | 'preminor' | 'prepatch' | 'prerelease'

/**
 * Increments a version according to the specified bump type
 */
export function bumpVersion(version: string, type: BumpType, prereleaseId = 'alpha'): string {
  const parsed = parseSemVer(version)

  switch (type) {
    case 'major':
      return formatSemVer({
        major: parsed.major + 1,
        minor: 0,
        patch: 0,
        prerelease: [],
        build: [],
      })

    case 'minor':
      return formatSemVer({
        major: parsed.major,
        minor: parsed.minor + 1,
        patch: 0,
        prerelease: [],
        build: [],
      })

    case 'patch':
      return formatSemVer({
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch + 1,
        prerelease: [],
        build: [],
      })

    case 'premajor':
      return formatSemVer({
        major: parsed.major + 1,
        minor: 0,
        patch: 0,
        prerelease: [prereleaseId, '0'],
        build: [],
      })

    case 'preminor':
      return formatSemVer({
        major: parsed.major,
        minor: parsed.minor + 1,
        patch: 0,
        prerelease: [prereleaseId, '0'],
        build: [],
      })

    case 'prepatch':
      return formatSemVer({
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch + 1,
        prerelease: [prereleaseId, '0'],
        build: [],
      })

    case 'prerelease':
      if (parsed.prerelease.length === 0) {
        // No existing prerelease, bump patch and add prerelease
        return formatSemVer({
          major: parsed.major,
          minor: parsed.minor,
          patch: parsed.patch + 1,
          prerelease: [prereleaseId, '0'],
          build: [],
        })
      } else {
        // Increment the numeric part of the prerelease
        const newPrerelease = [...parsed.prerelease]
        const lastIndex = newPrerelease.length - 1
        const lastValue = parseInt(newPrerelease[lastIndex]!, 10)

        if (!isNaN(lastValue)) {
          newPrerelease[lastIndex] = String(lastValue + 1)
        } else {
          newPrerelease.push('0')
        }

        return formatSemVer({
          ...parsed,
          prerelease: newPrerelease,
          build: [],
        })
      }

    default:
      throw new Error(`Unknown bump type: ${type}`)
  }
}

/**
 * Checks if version A satisfies being greater than or equal to version B
 */
export function satisfiesGte(version: string, minimum: string): boolean {
  return compareSemVer(version, minimum) >= 0
}

/**
 * Checks if version A satisfies being less than version B
 */
export function satisfiesLt(version: string, maximum: string): boolean {
  return compareSemVer(version, maximum) < 0
}

/**
 * Checks if a version is a prerelease version
 */
export function isPrerelease(version: string): boolean {
  const parsed = parseSemVer(version)
  return parsed.prerelease.length > 0
}

/**
 * Extracts version from a git tag (e.g., "@package/name@1.0.0" -> "1.0.0")
 */
export function extractVersionFromTag(tag: string): string | undefined {
  // Match common tag patterns:
  // - @scope/package@1.0.0
  // - package@1.0.0
  // - v1.0.0
  // - 1.0.0
  const patterns = [
    /@([0-9]+\.[0-9]+\.[0-9]+.*)$/, // @scope/package@version or package@version
    /^v?([0-9]+\.[0-9]+\.[0-9]+.*)$/, // v1.0.0 or 1.0.0
  ]

  for (const pattern of patterns) {
    const match = tag.match(pattern)
    if (match?.[1] && isValidSemVer(match[1])) {
      return match[1]
    }
  }

  return undefined
}

/**
 * Filters versions to only include stable (non-prerelease) versions
 */
export function getStableVersions(versions: string[]): string[] {
  return versions.filter((v) => !isPrerelease(v))
}

/**
 * Filters versions to only include prerelease versions
 */
export function getPrereleaseVersions(versions: string[]): string[] {
  return versions.filter(isPrerelease)
}

/**
 * Extracts the prerelease identifier from a version (e.g., "alpha" from "1.0.0-alpha.1")
 */
export function getPrereleaseIdentifier(version: string): string | undefined {
  const parsed = parseSemVer(version)

  if (parsed.prerelease.length === 0) {
    return undefined
  }

  // First non-numeric identifier is typically the prerelease name
  return parsed.prerelease.find((id) => isNaN(parseInt(id, 10)))
}
