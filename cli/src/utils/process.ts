import { spawnSync as nodeSpawnSync, SpawnSyncOptionsWithStringEncoding } from 'child_process'

export function backoff(attempt: number) {
  return 100 * 2 ** attempt
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
