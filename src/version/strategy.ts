export enum VersionStrategy {
  ConventionalCommits = 'conventional-commits',
  Patch = 'patch',
  Minor = 'minor',
  Major = 'major',
}

export function assertValidStrategy(input: unknown): asserts input is VersionStrategy {
  const strategies: unknown[] = Object.values(VersionStrategy)

  if (!strategies.includes(input)) {
    throw new Error(
      `Invalid version strategy ${input} provided. Permitted values are ${strategies}`
    )
  }
}

export function strategyAsArgument(strategy: VersionStrategy): string {
  return strategy === VersionStrategy.ConventionalCommits ? '--conventional-commits' : strategy
}
