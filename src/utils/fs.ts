import * as fs from 'fs'

export async function readJson<ReturnType>(
  path: string,
  { filesystem }: { filesystem: typeof fs }
): Promise<ReturnType | undefined> {
  let buffer: Buffer
  try {
    buffer = await filesystem.promises.readFile(path)
  } catch {
    return undefined
  }

  return JSON.parse(buffer.toString())
}
