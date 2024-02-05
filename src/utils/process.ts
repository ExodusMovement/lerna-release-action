import { spawnSync as nodeSpawnSync, SpawnSyncOptionsWithStringEncoding } from 'child_process'

export const spawnSync = (
  command: string,
  args: string[],
  options: Partial<SpawnSyncOptionsWithStringEncoding> = {}
) => {
  const { stdout, stderr, status } = nodeSpawnSync(command, args, { encoding: 'utf8', ...options })

  if (status !== 0) {
    throw new Error(stderr)
  }

  return stdout
}
