import { filesToPackages } from './files-to-packages'

describe('filesToPackages', () => {
  const paths = {
    '@scope/a': 'features/a',
    '@scope/b': 'features/b',
    '@scope/nested': 'libraries/group/nested',
  }

  test('attributes files under a package directory', () => {
    const touched = filesToPackages(['features/a/index.js', 'features/a/src/foo.ts'], paths)
    expect([...touched]).toEqual(['@scope/a'])
  })

  test('attributes a single commit to multiple packages when both touched', () => {
    const touched = filesToPackages(['features/a/index.js', 'features/b/test.js'], paths)
    expect([...touched].sort()).toEqual(['@scope/a', '@scope/b'])
  })

  test('does NOT match partial directory names', () => {
    const touched = filesToPackages(['features/abc/index.js'], paths)
    expect([...touched]).toEqual([])
  })

  test('matches deeply nested packages', () => {
    const touched = filesToPackages(['libraries/group/nested/src/foo.ts'], paths)
    expect([...touched]).toEqual(['@scope/nested'])
  })

  test('returns empty for files outside any package', () => {
    const touched = filesToPackages(['README.md', 'tools/foo.js'], paths)
    expect([...touched]).toEqual([])
  })
})
