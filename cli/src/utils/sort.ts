import * as path from 'path'

export function byBasenameAsc(a: string, b: string) {
  const nameA = path.basename(a)
  const nameB = path.basename(b)

  if (nameA > nameB) return 1
  if (nameA < nameB) return -1

  return 0
}
