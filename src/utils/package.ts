import * as path from 'path'
import * as fs from 'fs'
import { readJson } from './fs'
import { LernaConfig, PackageJson } from './types'

type Params = {
  filesystem?: typeof fs
}

type GetPackagePathsByFolderParams = {
  packageRoots: string[]
} & Params

export async function getPackagePathsByFolder({
  packageRoots,
  filesystem = fs,
}: GetPackagePathsByFolderParams): Promise<{ [folder: string]: string }> {
  const folderPaths = await Promise.all(
    packageRoots.map(async (root) => {
      const folders = await filesystem.promises.readdir(root)
      return folders.map((folder) => [folder, path.join(root, folder)])
    })
  )
  return Object.fromEntries(folderPaths.flat())
}

export async function getPackageNameByPath(packagePath: string, { filesystem = fs }: Params = {}) {
  const packageJson = await readJson<PackageJson>(path.join(packagePath, 'package.json'), {
    filesystem,
  })

  return packageJson?.name
}

export async function getPackagePaths({ filesystem = fs }: Params = {}) {
  const packageRoots = await getPackageRoots({ filesystem })
  const paths = await Promise.all(
    packageRoots.map(async (root) => {
      const folders = await filesystem.promises.readdir(root)
      return folders.map((folder) => path.join(root, folder))
    })
  )
  return paths.flat()
}

export async function getPackageRoots({ filesystem = fs }: Params = {}) {
  const lernaConfig = await readJson<LernaConfig>('lerna.json', { filesystem })
  const packageRoots = lernaConfig?.packages ?? ['packages/*']

  return packageRoots.map((it: string) => path.dirname(it))
}
