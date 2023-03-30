export function toKebabCase(text: string): string {
  return text.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

const ellipsis = '...'
export function truncate(text: string, maxLen: number) {
  if (text.length < maxLen) {
    return text
  }

  const { indexes } = text.split(/[\s,.:]/).reduce<{ indexes: [number, string][]; cursor: number }>(
    ({ indexes, cursor }, word) => {
      const index = text.indexOf(word, cursor)
      indexes.push([index, word])
      return { indexes, cursor: index + word.length }
    },
    { indexes: [], cursor: 0 }
  )

  const lastValidIndex =
    indexes.findIndex(([index, word]) => index + word.length + ellipsis.length >= maxLen) - 1

  if (lastValidIndex === -1) {
    return ellipsis.slice(0, maxLen)
  }

  const [index, word] = indexes[lastValidIndex]! // eslint-disable-line @typescript-eslint/no-non-null-assertion
  const splitAt = index + word.length

  return `${text.slice(0, splitAt)}${ellipsis}`
}

export function pluralize(word: string, count: number) {
  if (count === 1) return word

  return `${word}s`
}
