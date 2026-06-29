declare module 'conventional-changelog-conventionalcommits'
declare module 'conventional-changelog-core'

declare module 'conventional-commits-parser' {
  export function sync(commit: string, options?: unknown): Record<string, unknown>
}
