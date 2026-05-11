/**
 * Attribute a set of touched file paths to workspace packages.
 *
 * A file maps to a package iff its repo-relative path equals the package's
 * directory or starts with it followed by a slash. This deliberately rejects
 * sibling directories with overlapping prefixes (`features/abc` vs.
 * `features/abc-old`).
 *
 * @param files — repo-relative paths.
 * @param packagePaths — { packageName: repoRelativeDir }.
 */
export function filesToPackages(
  files: string[],
  packagePaths: Record<string, string>
): Set<string> {
  const touched = new Set<string>()
  const entries: [string, string][] = Object.entries(packagePaths).map(([name, dir]) => [
    name,
    ensureTrailingSlash(dir),
  ])
  for (const file of files) {
    for (const [name, prefix] of entries) {
      if (file === prefix.slice(0, -1) || file.startsWith(prefix)) {
        touched.add(name)
      }
    }
  }

  return touched
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}
