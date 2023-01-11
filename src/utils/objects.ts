import { toSnakeCase } from './strings'

export function stringifyFlags(flags: { [key: string]: boolean } | undefined): string {
  return Object.entries(flags ?? {})
    .reduce((all, [flag, enabled]) => {
      if (enabled) {
        return `${all} --${toSnakeCase(flag)}`
      }

      return all
    }, '')
    .trim()
}
