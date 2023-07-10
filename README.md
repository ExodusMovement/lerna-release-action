[![Checks](https://github.com/ExodusMovement/lerna-release-action/actions/workflows/checks.yml/badge.svg)](https://github.com/ExodusMovement/lerna-release-action/actions/workflows/checks.yml)

## ExodusMovement/lerna-release-action

### Version workflow

```yaml
name: Version
on:
  workflow_dispatch:
    inputs:
      packages:
        description: 'Selected packages as comma separated string, e.g. modules/storage-spec,libraries/formatting'
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
          github-token: ${{ secrets.GH_AUTOMATION_PAT }}
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
