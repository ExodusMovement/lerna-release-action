export const BUMP_NONE = 'none'
export const BUMP_PATCH = 'patch'
export const BUMP_MINOR = 'minor'
export const BUMP_MAJOR = 'major'

export type Bump = typeof BUMP_NONE | typeof BUMP_PATCH | typeof BUMP_MINOR | typeof BUMP_MAJOR

const RANK: Record<Bump, number> = {
  [BUMP_NONE]: 0,
  [BUMP_PATCH]: 1,
  [BUMP_MINOR]: 2,
  [BUMP_MAJOR]: 3,
}

const HEADER_REGEX = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:/

/**
 * Map a single conventional-commit message to a bump level.
 *
 *   - `<type>(<scope>)!: ...` / `<type>!: ...`           → major
 *   - body line `BREAKING CHANGE:` / `BREAKING-CHANGE:`  → major
 *   - type === 'feat'                                    → minor
 *   - type === 'fix' or 'perf'                           → patch
 *   - anything else                                      → none
 */
export function bumpFromMessage(message: unknown): Bump {
  if (typeof message !== 'string' || message.length === 0) return BUMP_NONE
  const [subject = '', ...rest] = message.split(/\r?\n/)
  const body = rest.join('\n')

  const match = HEADER_REGEX.exec(subject.trim())
  if (!match || !match.groups) return BUMP_NONE
  const { type, breaking } = match.groups

  if (breaking === '!' || /^BREAKING[ -]CHANGE:/m.test(body)) return BUMP_MAJOR
  if (type === 'feat') return BUMP_MINOR
  if (type === 'fix' || type === 'perf') return BUMP_PATCH
  return BUMP_NONE
}

/**
 * Pick the higher of two bump levels.
 */
export function maxBump(a: Bump, b: Bump): Bump {
  return RANK[a] >= RANK[b] ? a : b
}
