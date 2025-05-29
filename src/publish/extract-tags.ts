export function extractTags(publishStdout: string) {
  const parts = publishStdout.split('Successfully published:')
  const lines = parts[1]?.trim().split('\n')

  if (!lines) {
    return
  }

  return lines.map((line) => line.trim().replace(/^-\s+/, '')).filter(Boolean)
}
