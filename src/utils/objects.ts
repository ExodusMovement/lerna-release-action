import { toKebabCase } from './strings'

export function stringifyFlags(flags: { [key: string]: boolean } | undefined): string {
  return Object.entries(flags ?? {})
    .reduce((all, [flag, enabled]) => {
      if (enabled) {
        return `${all} --${toKebabCase(flag)}`
      }

      return all
    }, '')
    .trim()
}
