import { createFsFromVolume } from 'memfs'
import { DirectoryJSON, Volume } from 'memfs/lib/volume'

export function createFsFromJSON(json: DirectoryJSON) {
  return createFsFromVolume(Volume.fromJSON(json))
}
