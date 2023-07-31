export enum Input {
  Assignee = 'assignee',
  GithubToken = 'github-token',
  Packages = 'packages',
  Ref = 'ref',
  VersionExtraArgs = 'version-extra-args',
  VersionStrategy = 'version-strategy',
  AutoMerge = 'auto-merge',
  RequestReviewers = 'request-reviewers',
}

export enum VersionDispatchInput {
  GithubToken = 'github-token',
  Ref = 'ref',
  VersionWorkflowId = 'version-workflow-id',
  ExcludeCommitTypes = 'exclude-commit-types',
  ExcludeLabels = 'exclude-labels',
}

export const RELEASE_PR_LABEL = 'publish-on-merge'
