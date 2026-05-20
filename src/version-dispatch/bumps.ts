import { parseMessage } from '../utils/conventional-commits'

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
  const parsed = parseMessage(message)
  if (!parsed) return BUMP_NONE
  if (parsed.breaking) return BUMP_MAJOR
  if (parsed.type === 'feat') return BUMP_MINOR
  if (parsed.type === 'fix' || parsed.type === 'perf') return BUMP_PATCH
  return BUMP_NONE
}

/**
 * Pick the higher of two bump levels.
 */
export function maxBump(a: Bump, b: Bump): Bump {
  return RANK[a] >= RANK[b] ? a : b
}
