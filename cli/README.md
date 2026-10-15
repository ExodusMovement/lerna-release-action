## @exodus/lerna-release-action-cli

CLI that supplies inputs to lerna-release-action/version

### Usage

```bash
# using package names
lerna-release-action @exodus/batcave,@exodus/wayne-manor
# using folder names, patching
lerna-release-action batcave,wayne-manor --version-strategy patch
# using qualified paths
lerna-release-action modules/batcave,libraries/wayne-manor
# using interactive prompt
lerna-release-action
# using interactive prompt with static versioning
lerna-release-action -vs minor
# release everything with unreleased feat/fix/perf/breaking changes
lerna-release-action $(lerna-release-action --list-unreleased)
```

`--list-unreleased` prints, as a comma-separated list, every non-private
package that has a releasing change (`feat`/`fix`/`perf`/breaking) since its
latest release tag. Packages whose only changes are
`chore`/`build`/`docs`/`ci`/`test`/`refactor`/`style` (not even a patch) are
omitted, as are packages already up to date; never-released packages are
always included. Only the list is written to stdout, so it composes directly
into a release run as shown above.

The detection is content-anchored to resist messy tag history:

1. **Baseline** = the `<name>@<version>` tag at or below the package's current
   package.json version (ignores higher tags left by an unrelated package that
   once shared the name).
2. **Gate** on the actual `baseline..HEAD` diff for the directory — no content
   change means up to date, regardless of what commit ancestry suggests.
3. **Attribute** only the surviving changed lines: blame them to the PR that
   produced them, then fetch that PR's retained `refs/pull/<n>/head` and ask
   its pre-squash commits (the same per-commit attribution `version-dispatch`
   uses) whether they actually release this package. This rejects both already
   released commits leaking through non-linear history and `feat`-titled sweeps
   whose real per-package change was a chore.

This requires network access to `origin` (one ref fetch per candidate PR) and
is meant to run on an up-to-date default branch.

It uses the same per-commit attribution as `version-dispatch` but **does not
honor `skip-release`**: that label gates version-dispatch's automatic release
on merge, not whether a change is unreleased. A deliberate "release the
backlog" sweep should surface skip-released changes too — you decide what to
ship at the confirmation prompt.

### Limitation

The baseline is only as trustworthy as the release tags. In a repo whose tags
sit on linear, per-package release commits this is reliable. In a repo with
non-linear history where a tag commit's tree does **not** contain the package's
released content (e.g. batch-release commits that tagged many packages at
once), the `baseline..HEAD` diff can include already-released content, so that
package may be reported even though it is up to date. Treat the output as
release **candidates** to review, not a list to publish unattended.
