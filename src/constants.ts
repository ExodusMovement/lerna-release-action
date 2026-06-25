export enum Input {
  Assignee = 'assignee',
  GithubToken = 'github-token',
  Packages = 'packages',
  Path = 'path',
  Ref = 'ref',
  VersionExtraArgs = 'version-extra-args',
  VersionStrategy = 'version-strategy',
  Bumps = 'bumps',
  AutoMerge = 'auto-merge',
  Draft = 'draft',
  RequestReviewers = 'request-reviewers',
  BaseBranch = 'base-branch',
  FormatCommand = 'format-command',
}

export enum PublishInput {
  GithubToken = 'github-token',
  Path = 'path',
  RequiredBranchRulesets = 'required-branch-rulesets',
  DistTag = 'dist-tag',
}

export enum VersionDispatchInput {
  GithubToken = 'github-token',
  Path = 'path',
  Ref = 'ref',
  VersionWorkflowId = 'version-workflow-id',
  ExcludeLabels = 'exclude-labels',
  DryRun = 'dry-run',
  PrNumber = 'pr-number',
}

export const RELEASE_PR_LABEL = 'publish-on-merge'
