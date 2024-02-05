import { spawnSync } from './process'
import logger from './logger'

export const pullTags = () => {
  logger.info('Pulling latest tags')
  spawnSync('git', ['pull', '--tags'])
}

export const assertCleanCWD = () => {
  const stdout = spawnSync('git', ['status', '--short'])
  const changes = stdout.trim()

  if (changes) {
    throw new Error('Current working directory contains uncommitted changes')
  }

  logger.info('Fetching remote changes')
  spawnSync('git', ['fetch'], { stdio: 'inherit' })
  try {
    spawnSync('git', ['diff', 'HEAD', 'origin/master', '--exit-code'])
  } catch {
    throw new Error('Branch has to be up-to-date with master')
  }
}

export const getUsername = () => {
  return spawnSync('git', ['config', 'user.name']).trim()
}
