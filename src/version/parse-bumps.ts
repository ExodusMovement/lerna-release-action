/**
 * Parse the optional `bumps` action input. Returns `undefined` when the input
 * is empty (so the caller falls back to the existing `version-strategy` flow);
 * otherwise returns a `{ pkg: bump }` map with every entry validated.
 *
 * Throws on malformed JSON or unknown bump levels so the action surfaces the
 * problem at the very top of the run rather than letting lerna fail with a
 * confusing error 10 steps later.
 */

const VALID_BUMPS = new Set([
  'major',
  'minor',
  'patch',
  'premajor',
  'preminor',
  'prepatch',
  'prerelease',
])

export function parseBumps(raw: string | undefined): Record<string, string> | undefined {
  if (!raw || raw.trim() === '') return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `Failed to parse \`bumps\` input as JSON: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('`bumps` must be a JSON object of `{ "<package>": "<bump>" }`')
  }

  const out: Record<string, string> = {}
  for (const [pkg, bump] of Object.entries(parsed)) {
    if (typeof bump !== 'string' || !VALID_BUMPS.has(bump)) {
      throw new Error(
        `Invalid bump "${String(bump)}" for "${pkg}" in \`bumps\`. Valid values: ${[...VALID_BUMPS].join(', ')}`
      )
    }

    out[pkg] = bump
  }

  if (Object.keys(out).length === 0) return undefined

  return out
}
