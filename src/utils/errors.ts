export const unwrapErrorMessage = (error: unknown, defaultMessage: string) => {
  if (error instanceof Error) return error.message

  return defaultMessage
}

type HttpError = {
  response: Response
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && 'response' in error
}
