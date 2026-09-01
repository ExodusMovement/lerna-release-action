/**
 * Validation utilities for lerna release action inputs
 */

/**
 * Validates that a package name follows npm naming conventions
 * @see https://docs.npmjs.com/cli/v9/configuring-npm/package-json#name
 */
export function isValidPackageName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false
  }

  // Package name must be <= 214 characters
  if (name.length > 214) {
    return false
  }

  // Scoped package: @scope/name
  const scopedPattern = /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/
  // Unscoped package: name
  const unscopedPattern = /^[a-z0-9-~][a-z0-9-._~]*$/

  return scopedPattern.test(name) || unscopedPattern.test(name)
}

/**
 * Extracts the scope from a scoped package name
 * @returns The scope without @ prefix, or undefined if not scoped
 */
export function getPackageScope(name: string): string | undefined {
  if (!name.startsWith('@')) {
    return undefined
  }

  const match = name.match(/^@([^/]+)\//)
  return match?.[1]
}

/**
 * Extracts the unscoped name from a package name
 */
export function getUnscopedName(name: string): string {
  if (!name.startsWith('@')) {
    return name
  }

  const slashIndex = name.indexOf('/')
  return slashIndex === -1 ? name : name.slice(slashIndex + 1)
}

/**
 * Validates that a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validates a comma-separated list of package names
 * @returns Object with valid packages and any invalid entries
 */
export function validatePackagesCsv(csv: string): {
  valid: string[]
  invalid: string[]
} {
  const packages = csv.split(',').map((p) => p.trim()).filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []

  for (const pkg of packages) {
    // Allow both full package names and short folder names
    if (isValidPackageName(pkg) || /^[\w-]+$/.test(pkg)) {
      valid.push(pkg)
    } else {
      invalid.push(pkg)
    }
  }

  return { valid, invalid }
}

/**
 * Validates that a branch name follows git branch naming conventions
 */
export function isValidBranchName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false
  }

  // Git branch name restrictions
  const invalidPatterns = [
    /^\./, // Cannot start with a dot
    /\.\.$/, // Cannot end with ..
    /\.lock$/, // Cannot end with .lock
    /^-/, // Cannot start with a hyphen
    /@\{/, // Cannot contain @{
    /\\/, // Cannot contain backslash
    /\s/, // Cannot contain whitespace
    /~/, // Cannot contain tilde
    /\^/, // Cannot contain caret
    /:/, // Cannot contain colon
    /\?/, // Cannot contain question mark
    /\*/, // Cannot contain asterisk
    /\[/, // Cannot contain open bracket
    /\/\//, // Cannot have consecutive slashes
    /\/$/, // Cannot end with slash
  ]

  return !invalidPatterns.some((pattern) => pattern.test(name))
}

/**
 * Validates a GitHub personal access token format
 * Note: This only checks format, not validity
 */
export function isValidGitHubTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false
  }

  // Classic PAT: ghp_xxxx (40 chars after prefix)
  // Fine-grained PAT: github_pat_xxxx
  // OAuth token: gho_xxxx
  // GitHub App token: ghs_xxxx or ghu_xxxx
  const patterns = [
    /^ghp_[a-zA-Z0-9]{36}$/, // Classic PAT
    /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/, // Fine-grained PAT
    /^gho_[a-zA-Z0-9]{36}$/, // OAuth token
    /^ghs_[a-zA-Z0-9]{36}$/, // GitHub App server token
    /^ghu_[a-zA-Z0-9]{36}$/, // GitHub App user token
  ]

  return patterns.some((pattern) => pattern.test(token))
}

/**
 * Sanitizes a string for safe use in shell commands
 */
export function sanitizeForShell(input: string): string {
  // Remove or escape dangerous characters
  return input.replace(/[;&|`$(){}[\]<>\\'"!#]/g, '')
}

/**
 * Validates that a workflow ID follows expected patterns
 */
export function isValidWorkflowId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false
  }

  // Workflow ID can be a filename (version.yaml) or numeric ID
  const filenamePattern = /^[\w-]+\.(ya?ml)$/
  const numericPattern = /^\d+$/

  return filenamePattern.test(id) || numericPattern.test(id)
}

/**
 * Validates commit type for conventional commits
 */
export function isValidCommitType(type: string): boolean {
  const validTypes = [
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'perf',
    'test',
    'build',
    'ci',
    'chore',
    'revert',
  ]

  return validTypes.includes(type.toLowerCase())
}

/**
 * Asserts a condition and throws an error with a descriptive message if false
 */
export function assertInput(
  condition: boolean,
  inputName: string,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(`Invalid input "${inputName}": ${message}`)
  }
}
