export function backoff(attempt: number) {
  return 100 * 2 ** attempt
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
