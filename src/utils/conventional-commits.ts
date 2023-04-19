export function parseMessage(message: string): { type: string } {
  const type = message.match(/^([^!(:])+/)?.[0]
  if (!type) {
    throw new Error(`Failed to parse message as conventional commit: ${message}`)
  }

  return { type }
}
