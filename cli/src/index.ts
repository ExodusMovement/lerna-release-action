import getPackages from './get-packages'
import * as path from 'path'
import { prompt } from 'enquirer'
import { byBasenameAsc } from './utils/sort'
import { getPullRequestUrl, watchRun } from './utils/gh'
import { exec } from '../../src/utils/process'

async function main() {
  const packages = await getPackages(process.argv[2])

  if (packages.length === 0) {
    console.log('No packages selected for release. Aborting')
    process.exit(-1)
  }

  const { stdout } = await exec(
    'echo n | lerna version --conventional-commits --no-git-tag-version --force-publish'
  )

  const bumps = stdout
    .split('\n')
    .filter((line) => packages.some((it) => line.match(`@exodus/${path.basename(it)}:`)))

  const { confirm } = await prompt<{ confirm: boolean }>({
    name: 'confirm',
    message:
      'Are you okay to release the following?\n' +
      '' +
      'Note: The versions are only accurate if you pulled the latest tags before.\n' +
      bumps.join('\n') +
      '\n',
    type: 'confirm',
  }).catch(() => ({ confirm: false }))

  if (!confirm) {
    console.log('Aborted')
    process.exit(-1)
  }

  const selectedModules = packages.sort(byBasenameAsc).join(',')

  try {
    const { stdout: runStdout, stderr } = await exec(
      `gh workflow run version --field packages=${selectedModules}`
    )
    if (stderr) {
      console.error(`${stderr}`)
    }

    console.log(runStdout)

    await watchRun()

    const url = await getPullRequestUrl()
    if (url) {
      console.log(`Successfully created PR. You can view it here: ${url}`)
    }
  } catch (e) {
    console.error(`Unexpected error occurred: ${e}`)
  }
}

main()
