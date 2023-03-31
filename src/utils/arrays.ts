export function unique<T>(array: T[]): T[] {
  return array.filter((e, i) => array.indexOf(e) === i)
}

export function joinNatural(array: string[]): string {
  if (array.length === 1) return array[0]! // eslint-disable-line @typescript-eslint/no-non-null-assertion

  const [last] = array.slice(-1)
  return array.slice(0, -1).join(', ') + `, and ${last}`
}
