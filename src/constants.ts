export enum Input {
  Assignee = 'assignee',
  GithubToken = 'github-token',
  Packages = 'packages',
  Ref = 'ref',
  VersionExtraArgs = 'version-extra-args',
  VersionStrategy = 'version-strategy',
  AutoMerge = 'auto-merge',
  Draft = 'draft',
  RequestReviewers = 'request-reviewers',
  Committer = 'committer',
  BaseBranch = 'base-branch',
}

export enum PublishInput {
  GithubToken = 'github-token',
  RequiredBranchRulesets = 'required-branch-rulesets',
  DistTag = 'dist-tag',
}

export enum VersionDispatchInput {
  GithubToken = 'github-token',
  Ref = 'ref',
  VersionWorkflowId = 'version-workflow-id',
  ExcludeCommitTypes = 'exclude-commit-types',
  ExcludeLabels = 'exclude-labels',
}

export const RELEASE_PR_LABEL = 'publish-on-merge'
