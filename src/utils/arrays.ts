export function unique<T>(array: T[]): T[] {
  return array.filter((e, i) => array.indexOf(e) === i)
}

export function joinNatural(elements: string[]): string {
  if (elements.length === 1) return elements[0]! // eslint-disable-line @typescript-eslint/no-non-null-assertion

  const [last] = elements.slice(-1)
  return elements.slice(0, -1).join(', ') + `, and ${last}`
}
