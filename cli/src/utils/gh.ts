import { backoff, sleep } from './process'
import { exec as execCb } from 'child_process'
import { exec } from '../../../src/utils/process'

export async function getPullRequestUrl() {
  const { stdout } = await exec(
    "gh pr list --label publish-on-merge --limit 1 --json url -q '.[0].url' | tee"
  )
  return stdout.trim()
}

export async function watchRun() {
  console.log('Attempting to capture workflow run output')

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
          console.log(data)
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
