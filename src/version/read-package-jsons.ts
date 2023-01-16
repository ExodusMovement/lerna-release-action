import { Filesystem, PackageContentByPath } from '../utils/types'
import * as fs from 'fs'
import * as path from 'path'
import { parsePackageFiles } from '@exodus/lerna-utils'

type Params = {
  filesystem?: Filesystem
}

export default async function readPackageJsons({
  filesystem = fs,
}: Params = {}): Promise<PackageContentByPath> {
  const contents = await parsePackageFiles('package.json', { filesystem })

  return Object.fromEntries(
    contents.map(({ content, path: filePath }) => [path.dirname(filePath), content])
  ) as PackageContentByPath
}
