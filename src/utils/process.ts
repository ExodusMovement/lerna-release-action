import { spawnSync as nodeSpawnSync, SpawnSyncOptionsWithStringEncoding } from 'child_process'

export const spawnSync = (
  command: string,
  args: string[],
  options: Omit<Partial<SpawnSyncOptionsWithStringEncoding>, 'shell'> = {}
) => {
  const { stdout, stderr, status } = nodeSpawnSync(command, args, {
    encoding: 'utf8',
    ...options,
    shell: false,
  })

  if (status !== 0) {
    throw new Error(stderr)
  }

  return stdout
}
