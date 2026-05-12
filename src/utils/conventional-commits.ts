const HEADER_REGEX = /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:/
const BREAKING_FOOTER_REGEX = /^BREAKING[ -]CHANGE:/m

export type ConventionalCommit = {
  type: string
  scope?: string
  breaking: boolean
}

/**
 * Parse a conventional-commit subject (plus optional body for the
 * `BREAKING CHANGE:` footer) into its `{ type, scope?, breaking }`
 * components. Returns `null` when the subject does not match the
 * `<type>(<scope>)!?: ...` grammar so the caller can decide what to do.
 */
export function parseMessage(message: unknown): ConventionalCommit | null {
  if (typeof message !== 'string' || message.length === 0) return null
  const [subject = '', ...rest] = message.split(/\r?\n/)
  const match = HEADER_REGEX.exec(subject.trim())
  if (!match?.groups?.type) return null

  const { type, scope, breaking } = match.groups
  const breakingFooter = BREAKING_FOOTER_REGEX.test(rest.join('\n'))
  return {
    type,
    scope,
    breaking: breaking === '!' || breakingFooter,
  }
}
