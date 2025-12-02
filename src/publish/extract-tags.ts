const PUBLISH_SUCCESS_LINE_REGEX = /^lerna success published (\S+ \d+\.\d+\.\d+\S*)$/i

export function extractTags(publishStdout: string) {
  const lines = publishStdout.split('\n')

  return lines
    .map((line) => {
      const trimmed = line.trim()
      const [, match] = trimmed.match(PUBLISH_SUCCESS_LINE_REGEX) ?? []
      if (!match) {
        return
      }

      return match.replace(' ', '@')
    })
    .filter((value): value is string => !!value)
}
