import * as fs from 'node:fs'
import * as core from '@actions/core'
import { unwrapErrorMessage } from '../utils/errors'

type PublishedVersion = {
  packageName: string
  version: `v${string}`
}

const summaryFilePath = './lerna-publish-summary.json'

export function extractTags() {
  if (!fs.existsSync(summaryFilePath)) {
    return []
  }

  try {
    const summary = JSON.parse(
      fs.readFileSync('./lerna-publish-summary.json', { encoding: 'utf8' })
    ) as PublishedVersion[]

    return summary.map(({ packageName, version }) => [packageName, version].join('@'))
  } catch (e) {
    core.error(`Unable to read tags: ${unwrapErrorMessage(e, 'unknown error')}`)

    throw new Error('Failed to extract tags')
  }
}
