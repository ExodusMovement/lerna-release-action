import { backoff, sleep, spawnSync } from './process'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as yaml from 'yaml'
import * as path from 'path'
import logger from './logger'

export function getPullRequestUrl() {
  const stdout = spawnSync('gh', [
    'pr',
    'list',
    '--label',
    'publish-on-merge',
    '--limit',
    '1',
    '--json',
    'url',
    '-q',
    '.[0].url',
  ])
  return stdout.trim()
}

export function getToken() {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const hosts = fs.readFileSync(path.join(process.env.HOME!, '.config/gh/hosts.yml'), {
    encoding: 'utf8',
  })

  const config = yaml.parse(hosts)

  return config['github.com'].oauth_token
}

type SetGithubContextParams = {
  owner: string
  repo: string
}

/**
 * Function to polyfill env variables used by @actions/github
 */
export function setGithubContext({ owner, repo }: SetGithubContextParams) {
  process.env.GITHUB_REPOSITORY = `${owner}/${repo}`
}

const SSH_OWNER_NAME_REGEX = /:([^/]+)\/([^.]+)/
const HTTP_OWNER_NAME_REGEX = /\/([^/]+)\/([^/]+)$/

export function getRepo() {
  const remotes = spawnSync('git', ['remote'])
  const remote = remotes.trim().split('\n')[0]?.trim()

  if (!remote) throw new Error(`No remotes configured`)

  const url = spawnSync('git', ['remote', 'get-url', remote]).trim()
  const match = url.match(url.startsWith('http') ? HTTP_OWNER_NAME_REGEX : SSH_OWNER_NAME_REGEX)
  if (!match) throw new Error(`Remote ULR "${url}" not in expected format`)

  const [owner, name] = match.slice(1)

  if (!owner) throw new Error(`Unable to extract owner from "${url}"`)
  if (!name) throw new Error(`Unable to extract repo name from "${url}"`)

  return {
    owner,
    name,
  }
}

export async function watchRun() {
  logger.info('Attempting to capture workflow run output')

  const maxRetry = 3
  const capture = async (attempt = 0) => {
    const stdout = spawnSync('gh', [
      'run',
      'list',
      '--workflow=version.yaml',
      '--limit',
      '1',
      '--json',
      'databaseId',
      '-q',
      '.[0].databaseId',
    ])
    const runId = stdout.replace('\n', '')

    return new Promise<void>((resolve, reject) => {
      const command = spawn('gh', ['run', 'watch', runId])

      const cleanup = () => {
        command.removeAllListeners()
        command.stdout.removeAllListeners()
        command.stderr.removeAllListeners()
      }

      command.on('error', (e) => {
        cleanup()
        reject(e)
      })

      command.on('close', () => {
        cleanup()
        resolve()
      })

      command.stderr.on('data', (data) => {
        console.error(data.toString())
      })

      command.stdout.on('data', async function (data) {
        const line = data.toString()
        if (!line.includes('has already completed with')) {
          logger.info(line)
          return
        }

        cleanup()

        if (attempt === maxRetry) {
          return reject(new Error(`Unable capture workflow output`))
        }

        await sleep(backoff(attempt))

        capture(attempt + 1)
          .then(resolve)
          .catch(reject)
      })
    })
  }

  return capture()
}
