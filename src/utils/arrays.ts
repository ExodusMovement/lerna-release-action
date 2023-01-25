export function unique<T>(array: T[]): T[] {
  return array.filter((e, i) => array.indexOf(e) === i)
}
