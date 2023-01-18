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
```
