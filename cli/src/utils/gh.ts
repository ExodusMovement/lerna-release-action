import { backoff, sleep } from './process'
import { exec as execCb, execSync } from 'child_process'
import { exec } from '../../../src/utils/process'
import * as fs from 'fs'
import * as yaml from 'yaml'
import * as path from 'path'
import logger from './logger'

export async function getPullRequestUrl() {
  const { stdout } = await exec(
    "gh pr list --label publish-on-merge --limit 1 --json url -q '.[0].url' | tee"
  )
  return stdout.trim()
}

export function getToken() {
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
  const remotes = execSync('git remote', { encoding: 'utf8' })
  const remote = remotes.trim().split('\n')[0]?.trim()

  if (!remote) throw new Error(`No remotes configured`)

  const url = execSync(`git remote get-url ${remote}`, { encoding: 'utf8' }).trim()
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
    const { stdout } = await exec(
      "gh run list --workflow=version.yaml --limit 1 --json databaseId -q '.[0].databaseId' | tee"
    )
    const runId = stdout.replace('\n', '')

    return new Promise<void>((resolve, reject) => {
      const run = execCb(`gh run watch ${runId}`, (error, stdout) => {
        if (stdout.includes('has already completed with')) {
          return
        }

        if (error) {
          reject(error)
          return
        }

        resolve()
      })

      run.stdout?.on('data', async function (data) {
        if (!data.includes('has already completed with')) {
          logger.info(data)
          return
        }

        run.stdout?.removeAllListeners('data')

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
