import {
  isValidPackageName,
  getPackageScope,
  getUnscopedName,
  isNonEmptyString,
  validatePackagesCsv,
  isValidBranchName,
  isValidGitHubTokenFormat,
  sanitizeForShell,
  isValidWorkflowId,
  isValidCommitType,
  assertInput,
} from './validation'

describe('isValidPackageName', () => {
  it('should accept valid unscoped package names', () => {
    expect(isValidPackageName('lodash')).toBe(true)
    expect(isValidPackageName('my-package')).toBe(true)
    expect(isValidPackageName('package123')).toBe(true)
    expect(isValidPackageName('some.package')).toBe(true)
    expect(isValidPackageName('package_name')).toBe(true)
  })

  it('should accept valid scoped package names', () => {
    expect(isValidPackageName('@exodus/storage-spec')).toBe(true)
    expect(isValidPackageName('@scope/package')).toBe(true)
    expect(isValidPackageName('@my-org/my-package')).toBe(true)
    expect(isValidPackageName('@org123/pkg456')).toBe(true)
  })

  it('should reject invalid package names', () => {
    expect(isValidPackageName('')).toBe(false)
    expect(isValidPackageName('UPPERCASE')).toBe(false)
    expect(isValidPackageName('.startswith-dot')).toBe(false)
    expect(isValidPackageName('_startswith-underscore')).toBe(false)
    expect(isValidPackageName('has spaces')).toBe(false)
    expect(isValidPackageName('has/slash')).toBe(false)
  })

  it('should reject names exceeding 214 characters', () => {
    const longName = 'a'.repeat(215)
    expect(isValidPackageName(longName)).toBe(false)
  })

  it('should reject non-string inputs', () => {
    expect(isValidPackageName(null as unknown as string)).toBe(false)
    expect(isValidPackageName(undefined as unknown as string)).toBe(false)
    expect(isValidPackageName(123 as unknown as string)).toBe(false)
  })
})

describe('getPackageScope', () => {
  it('should extract scope from scoped package names', () => {
    expect(getPackageScope('@exodus/lerna-utils')).toBe('exodus')
    expect(getPackageScope('@my-org/my-package')).toBe('my-org')
    expect(getPackageScope('@scope/name')).toBe('scope')
  })

  it('should return undefined for unscoped packages', () => {
    expect(getPackageScope('lodash')).toBeUndefined()
    expect(getPackageScope('my-package')).toBeUndefined()
  })
})

describe('getUnscopedName', () => {
  it('should extract unscoped name from scoped packages', () => {
    expect(getUnscopedName('@exodus/lerna-utils')).toBe('lerna-utils')
    expect(getUnscopedName('@scope/package')).toBe('package')
  })

  it('should return the name as-is for unscoped packages', () => {
    expect(getUnscopedName('lodash')).toBe('lodash')
    expect(getUnscopedName('my-package')).toBe('my-package')
  })
})

describe('isNonEmptyString', () => {
  it('should return true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true)
    expect(isNonEmptyString('a')).toBe(true)
    expect(isNonEmptyString('  spaces  ')).toBe(true)
  })

  it('should return false for empty or whitespace-only strings', () => {
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString('\t\n')).toBe(false)
  })

  it('should return false for non-string values', () => {
    expect(isNonEmptyString(null)).toBe(false)
    expect(isNonEmptyString(undefined)).toBe(false)
    expect(isNonEmptyString(123)).toBe(false)
    expect(isNonEmptyString({})).toBe(false)
  })
})

describe('validatePackagesCsv', () => {
  it('should parse valid comma-separated package names', () => {
    const result = validatePackagesCsv('@exodus/storage-spec,@exodus/formatting')
    expect(result.valid).toEqual(['@exodus/storage-spec', '@exodus/formatting'])
    expect(result.invalid).toEqual([])
  })

  it('should handle whitespace around package names', () => {
    const result = validatePackagesCsv(' lodash , underscore , ramda ')
    expect(result.valid).toEqual(['lodash', 'underscore', 'ramda'])
    expect(result.invalid).toEqual([])
  })

  it('should accept folder names (short package identifiers)', () => {
    const result = validatePackagesCsv('storage-spec,formatting,my-pkg')
    expect(result.valid).toEqual(['storage-spec', 'formatting', 'my-pkg'])
    expect(result.invalid).toEqual([])
  })

  it('should separate valid and invalid entries', () => {
    const result = validatePackagesCsv('valid-pkg,@scope/pkg,has spaces')
    expect(result.valid).toEqual(['valid-pkg', '@scope/pkg'])
    expect(result.invalid).toEqual(['has spaces'])
  })

  it('should handle empty entries', () => {
    const result = validatePackagesCsv('pkg1,,pkg2,')
    expect(result.valid).toEqual(['pkg1', 'pkg2'])
    expect(result.invalid).toEqual([])
  })
})

describe('isValidBranchName', () => {
  it('should accept valid branch names', () => {
    expect(isValidBranchName('main')).toBe(true)
    expect(isValidBranchName('feature/my-feature')).toBe(true)
    expect(isValidBranchName('ci/release/abc123')).toBe(true)
    expect(isValidBranchName('fix-bug-123')).toBe(true)
  })

  it('should reject branch names starting with a dot', () => {
    expect(isValidBranchName('.hidden')).toBe(false)
  })

  it('should reject branch names with whitespace', () => {
    expect(isValidBranchName('has space')).toBe(false)
    expect(isValidBranchName('has\ttab')).toBe(false)
  })

  it('should reject branch names with invalid characters', () => {
    expect(isValidBranchName('has~tilde')).toBe(false)
    expect(isValidBranchName('has^caret')).toBe(false)
    expect(isValidBranchName('has:colon')).toBe(false)
    expect(isValidBranchName('has?question')).toBe(false)
    expect(isValidBranchName('has*asterisk')).toBe(false)
    expect(isValidBranchName('has[bracket')).toBe(false)
    expect(isValidBranchName('has\\backslash')).toBe(false)
  })

  it('should reject branch names ending with .lock', () => {
    expect(isValidBranchName('branch.lock')).toBe(false)
  })

  it('should reject empty or non-string values', () => {
    expect(isValidBranchName('')).toBe(false)
    expect(isValidBranchName(null as unknown as string)).toBe(false)
  })
})

describe('isValidGitHubTokenFormat', () => {
  it('should accept classic PAT format', () => {
    expect(isValidGitHubTokenFormat('ghp_' + 'a'.repeat(36))).toBe(true)
  })

  it('should accept OAuth token format', () => {
    expect(isValidGitHubTokenFormat('gho_' + 'a'.repeat(36))).toBe(true)
  })

  it('should accept GitHub App tokens', () => {
    expect(isValidGitHubTokenFormat('ghs_' + 'a'.repeat(36))).toBe(true)
    expect(isValidGitHubTokenFormat('ghu_' + 'a'.repeat(36))).toBe(true)
  })

  it('should reject invalid token formats', () => {
    expect(isValidGitHubTokenFormat('invalid-token')).toBe(false)
    expect(isValidGitHubTokenFormat('')).toBe(false)
    expect(isValidGitHubTokenFormat('ghp_short')).toBe(false)
  })
})

describe('sanitizeForShell', () => {
  it('should remove dangerous characters', () => {
    expect(sanitizeForShell('hello; rm -rf /')).toBe('hello rm -rf /')
    expect(sanitizeForShell('pkg && echo pwned')).toBe('pkg  echo pwned')
    expect(sanitizeForShell('$(whoami)')).toBe('whoami')
    expect(sanitizeForShell('`id`')).toBe('id')
  })

  it('should preserve safe characters', () => {
    expect(sanitizeForShell('my-package')).toBe('my-package')
    expect(sanitizeForShell('@scope/name')).toBe('@scope/name')
    expect(sanitizeForShell('package_name.spec')).toBe('package_name.spec')
  })
})

describe('isValidWorkflowId', () => {
  it('should accept valid workflow filenames', () => {
    expect(isValidWorkflowId('version.yaml')).toBe(true)
    expect(isValidWorkflowId('version.yml')).toBe(true)
    expect(isValidWorkflowId('ci-build.yaml')).toBe(true)
    expect(isValidWorkflowId('publish_packages.yml')).toBe(true)
  })

  it('should accept numeric workflow IDs', () => {
    expect(isValidWorkflowId('12345')).toBe(true)
    expect(isValidWorkflowId('1')).toBe(true)
  })

  it('should reject invalid workflow IDs', () => {
    expect(isValidWorkflowId('')).toBe(false)
    expect(isValidWorkflowId('file.txt')).toBe(false)
    expect(isValidWorkflowId('no-extension')).toBe(false)
  })
})

describe('isValidCommitType', () => {
  it('should accept standard conventional commit types', () => {
    expect(isValidCommitType('feat')).toBe(true)
    expect(isValidCommitType('fix')).toBe(true)
    expect(isValidCommitType('docs')).toBe(true)
    expect(isValidCommitType('style')).toBe(true)
    expect(isValidCommitType('refactor')).toBe(true)
    expect(isValidCommitType('perf')).toBe(true)
    expect(isValidCommitType('test')).toBe(true)
    expect(isValidCommitType('build')).toBe(true)
    expect(isValidCommitType('ci')).toBe(true)
    expect(isValidCommitType('chore')).toBe(true)
    expect(isValidCommitType('revert')).toBe(true)
  })

  it('should be case-insensitive', () => {
    expect(isValidCommitType('FEAT')).toBe(true)
    expect(isValidCommitType('Fix')).toBe(true)
  })

  it('should reject invalid commit types', () => {
    expect(isValidCommitType('feature')).toBe(false)
    expect(isValidCommitType('bugfix')).toBe(false)
    expect(isValidCommitType('random')).toBe(false)
  })
})

describe('assertInput', () => {
  it('should not throw when condition is true', () => {
    expect(() => assertInput(true, 'test', 'should pass')).not.toThrow()
  })

  it('should throw with descriptive message when condition is false', () => {
    expect(() => assertInput(false, 'packages', 'cannot be empty')).toThrow(
      'Invalid input "packages": cannot be empty'
    )
  })
})
