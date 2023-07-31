import normalizePackages from './action/version/normalize-packages'
import { prompt } from 'enquirer'
import { getPackagePaths } from '@exodus/lerna-utils'

const question = 'Which packages would you like to release?'
export default async function getPackages(packagesCsv?: string) {
  if (packagesCsv) {
    return normalizePackages({ packagesCsv })
  }

  const packages = await getPackagePaths()

  const answer = await prompt<{ packages: string[] }>({
    name: 'packages',
    message: question,
    type: 'multiselect',
    choices: packages.map((it) => ({ name: it })),
  }).catch(() => ({ packages: [] }))

  return answer.packages
}
