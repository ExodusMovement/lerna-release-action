import { toKebabCase } from './strings'
import * as assert from 'node:assert'

export function flagsAsArguments(
  flags: { [key: string]: boolean } | undefined,
  whitelistedFlags: string[]
): string[] {
  return Object.entries(flags ?? {}).reduce<string[]>((all, [flag, enabled]) => {
    assert(
      whitelistedFlags.includes(flag),
      `Only the following flags are allowed: ${whitelistedFlags.join(', ')}`
    )

    if (enabled) {
      all.push(`--${toKebabCase(flag)}`)
    }

    return all
  }, [])
}
