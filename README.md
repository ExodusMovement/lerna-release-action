[![Checks](https://github.com/ExodusMovement/lerna-release-action/actions/workflows/checks.yml/badge.svg)](https://github.com/ExodusMovement/lerna-release-action/actions/workflows/checks.yml)

## ExodusMovement/lerna-release-action

Action that allows selectively releasing packages in a lerna monorepo. It works around lerna's opinionated releasing of every dependant if a package changed. This comes with its own dangers and should be used with caution. The action creates
a release PR that is assigned to the user that dispatched the workflow.

### Version workflow

```yaml
name: Version
on:
  workflow_dispatch:
    inputs:
      packages:
        description: 'Selected packages as comma separated string, e.g. @exodus/storage-spec,@exodus/formatting or just storage-spec,formatting'
        type: string
        required: true

jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v3
        with:
          node-version-file: '.nvmrc'
      - name: Install dependencies
        run: yarn install
      - uses: ExodusMovement/lerna-release-action/version@master
        name: Version
        with:
          github-token: ${{ secrets.GH_AUTOMATION_PAT }} # should be a PAT so that checks run on the release PR
          packages: ${{ inputs.packages }}
```

#### Enabling auto-merge

The Version action can enable auto-merge on the created pull request. This is possible when the repository allows auto-merge, squash merging is enabled and has branch protection rules set up.

To use it, set the `auto-merge` input of the action to `true`.

```yaml
- uses: ExodusMovement/lerna-release-action/version@master
  name: Version
  with:
    # other inputs here
    auto-merge: true
```

### Publish workflow

```yaml
name: Publish
on:
  pull_request:
    types:
      - closed
  workflow_dispatch:

jobs:
  publish:
    runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
      with:
        ref: ${{ github.event.pull_request.head.sha }}
    - uses: actions/setup-node@v3
      with:
        node-version-file: '.nvmrc'
    - name: Install dependencies
      run: yarn install
    - name: Build
      run: yarn build
    - name: Publish
      uses: ExodusMovement/lerna-release-action/publish@master
```

### Version dispatch workflow

Automatically start versioning of packages when a PR is merged. Requires using `ExodusMovment/lerna-package-name-action` to label PRs, as these package labels will be used to determine the packages to be versioned.

```yaml
name: Version dispatch
on:
  pull_request:
    types:
      - closed

jobs:
  invoke-versioning:
    if: contains(github.event.pull_request.labels.*.name , 'publish-on-merge') == false && contains(github.event.pull_request.labels.*.name , 'skip-release') == false
    name: Invoke version workflow
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ExodusMovement/lerna-release-action/version-dispatch@master
        with:
          version-workflow-id: version.yaml
          github-token: ${{ secrets.GH_AUTOMATION_PAT }}
          exclude-commit-types: chore,docs,test,ci
```
