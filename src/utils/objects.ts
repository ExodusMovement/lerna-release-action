import { toKebabCase } from './strings'

export function flagsAsArguments(flags: { [key: string]: boolean } | undefined): string[] {
  return Object.entries(flags ?? {}).reduce<string[]>((all, [flag, enabled]) => {
    if (enabled) {
      all.push(`--${toKebabCase(flag)}`)
    }

    return all
  }, [])
}
