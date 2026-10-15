#!/usr/bin/env node

import getPackages from './get-packages'
import * as path from 'path'
import { prompt } from 'enquirer'
import { byBasenameAsc } from './utils/sort'
import { getPullRequestUrl, watchRun } from './utils/gh'
import { program } from 'commander'
import { ProgramOpts } from './utils/types'
import {
  assertStrategy,
  strategyAsArgument,
  validateAllowedStrategies,
} from './action/version/strategy'
import { version } from './local'
import listUnreleased from './list-unreleased'
import logger from './utils/logger'
import { spawnSync } from './utils/process'

program
  .name('lerna-release-action')
  .description('CLI to supply inputs to lerna-release-action/version')
  .argument('[packages]')
  .option(
    '-vs, --version-strategy <strategy>',
    'Allows customizing the version strategy.',
    'conventional-commits'
  )
  .option('-l, --local', 'Allows running the version workflow locally in case GH has issues')
  .option(
    '--list-unreleased',
    'Print packages with unreleased feat/fix/perf/breaking changes as a comma-separated list, then exit. Compose with: release $(release --list-unreleased)'
  )
  .option(
    '--github-token <token>',
    'Required for local versioning when token is not stored in ~/.config/gh/hosts.yml'
  )

async function main() {
  program.parse()

  const { versionStrategy, local, listUnreleased: listUnreleasedFlag } = program.opts<ProgramOpts>()

  if (listUnreleasedFlag) {
    const packages = await listUnreleased()
    packages.sort(byBasenameAsc)
    // Only the CSV goes to stdout so `$(release --list-unreleased)` stays clean.
    process.stdout.write(`${packages.join(',')}\n`)
    return
  }

  assertStrategy(versionStrategy)

  const [packagesCsv] = program.args

  if (local) return version({ packagesCsv, versionStrategy })

  const packages = await getPackages(packagesCsv)

  if (packages.length === 0) {
    throw new Error('No packages selected for release. Aborting')
  }

  await validateAllowedStrategies({ packages, versionStrategy })

  const stdout = spawnSync(
    'lerna',
    ['version', strategyAsArgument(versionStrategy), '--no-git-tag-version', '--force-publish'],
    { input: 'n\n' }
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
    throw new Error('Aborted')
  }

  const selectedPackages = packages.sort(byBasenameAsc).join(',')

  try {
    const stdout = spawnSync('gh', [
      'workflow',
      'run',
      'version',
      '--field',
      `packages=${selectedPackages}`,
      '--field',
      `version-strategy=${versionStrategy}`,
    ])

    logger.info(stdout)

    await watchRun()

    const url = getPullRequestUrl()
    if (url) {
      logger.info(`Successfully created PR. You can view it here: ${url}`)
    }
  } catch (e) {
    logger.error(`Unexpected error occurred: ${e}`)
  }
}

main().catch((error: Error) => {
  logger.error(error.message)
  process.exit(-1)
})
