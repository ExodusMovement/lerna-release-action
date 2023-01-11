import * as fs from 'fs'
import { exec } from './process'

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
}

export type Filesystem = typeof fs

export type Exec = typeof exec

export type PackageContentByPath = {
  [path: string]: PackageJson
}
