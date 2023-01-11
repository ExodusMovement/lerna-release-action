import * as github from '@actions/github'
import * as fs from 'fs'
import { exec } from './process'

export type GithubClient = ReturnType<typeof github.getOctokit>

export type Repo = {
  owner: string
  repo: string
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
