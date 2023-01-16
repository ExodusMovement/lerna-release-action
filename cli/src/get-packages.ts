import normalizePackages from '../../src/version/normalize-packages'
import { getPackagePathsByFolder, getPackageRoots } from '../../src/utils/package'
import { prompt } from 'enquirer'
const question = 'Which packages would you like to release?'
export default async function getPackages(packagesCsv?: string) {
  if (packagesCsv) {
    return normalizePackages({ packagesCsv })
  }

  const packageRoots = await getPackageRoots()
  const packagesByFolder = await getPackagePathsByFolder({ packageRoots })
  const packages = Object.values(packagesByFolder)

  const answer = await prompt<{ packages: string[] }>({
    name: 'packages',
    message: question,
    type: 'multiselect',
    choices: packages.map((it) => ({ name: it })),
  }).catch(() => ({ packages: [] }))

  return answer.packages
}
