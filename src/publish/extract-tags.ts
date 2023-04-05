import { unique } from '../utils/arrays'

export function extractTags(publishStdout: string) {
  const matches = publishStdout.match(/@exodus\/\S+@\d+\.\d+.\d+(-\w+\.\d+)?/g)
  if (!matches) {
    return
  }

  return unique(matches)
}
