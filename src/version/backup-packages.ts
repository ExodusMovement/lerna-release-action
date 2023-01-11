import { Filesystem } from '../utils/types'
import * as fs from 'fs'
import * as path from 'path'
import { getPackageRoots } from '../utils/package'

type Params = {
  filesystem?: Filesystem
}
export default async function backupPackages({ filesystem = fs }: Params = {}) {
  const { readFile, writeFile, mkdir, readdir, stat } = filesystem.promises

  const packageRoots = await getPackageRoots({ filesystem })
  const backupRoot = path.join('tmp', 'backup')
  await mkdir(backupRoot, { recursive: true })

  await Promise.all(
    packageRoots.map(async (root) => {
      const exists = await stat(root).catch(() => false)
      if (!exists) return

      const folders = await readdir(root)

      const backupFolder = path.join(backupRoot, root)
      await mkdir(backupFolder, { recursive: true })

      await Promise.all(
        folders.map(async (folder) => {
          if (folder.startsWith('.')) return

          const packagePath = path.join(root, folder, 'package.json')
          const exists = await stat(packagePath).catch(() => false)
          if (!exists) return

          const packageJson = await readFile(packagePath)
          await writeFile(path.join(backupFolder, `${folder}.json`), packageJson)
        })
      )
    })
  )
}
