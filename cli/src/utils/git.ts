import { execSync } from 'child_process'
import logger from './logger'

export const pullTags = () => {
  logger.info('Pulling latest tags')
  execSync('git pull --tags')
}

export const assertCleanCWD = () => {
  const stdout = execSync('git status --short', { encoding: 'utf8' })
  const changes = stdout.trim()

  if (changes) {
    throw new Error('Current working directory contains uncommitted changes')
  }

  logger.info('Fetching remote changes')
  execSync('git fetch', { stdio: 'inherit' })
  try {
    execSync('git diff HEAD origin/master --exit-code')
  } catch {
    throw new Error('Branch has to be up-to-date with master')
  }
}

export const getUsername = () => {
  return execSync('git config user.name', { encoding: 'utf8' }).trim()
}
