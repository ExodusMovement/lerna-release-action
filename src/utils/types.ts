import * as fs from 'fs'
import { VersionStrategy } from '../version/strategy'

export type Repo = {
  owner: string
  repo: string
}

export type Label = {
  name: string
}

export type LernaConfig = {
  packages?: string[]
}

export type PackageJson = {
  name: string
  dependencies?: Record<string, string | undefined>
  devDependencies?: Record<string, string | undefined>
  release?: {
    versionStrategy: {
      [packageName: string]: VersionStrategy[]
    }
  }
}

export type Filesystem = typeof fs

export type PackageContentByPath = {
  [path: string]: PackageJson
}
