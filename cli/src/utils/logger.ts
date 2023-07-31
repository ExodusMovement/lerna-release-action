import pino from 'pino'

const logger = pino({
  transport: {
    target: 'pino-pretty',
  },
})

const isDebug = (message: string) => message.includes('::debug::')
const clean = (message: string) => message.replace('::debug::', '')

process.stdout.write = (buffer) => {
  const message = buffer.toString().trim()

  if (isDebug(message)) {
    logger.debug(clean(message))
    return true
  }

  logger.info(message)
  return true
}

process.stderr.write = (buffer) => {
  const message = buffer.toString().trim()

  if (message) {
    logger.error(message)
  }

  return true
}

export default logger
