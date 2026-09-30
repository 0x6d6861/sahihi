/**
 * Errors thrown by envelope services (used by the api's routes, the public API and the worker).
 * The api maps them to HTTP in `app.onError`; the worker records them (e.g. on a bulk-send row).
 * `body` is the JSON response, so routes and the public API answer identically.
 */
export class EnvelopeError extends Error {
  constructor(
    readonly status: 400 | 402 | 403 | 404 | 409,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = "EnvelopeError"
  }

  get body() {
    return { error: this.code, message: this.message, ...this.extra }
  }
}

export const notFound = (what: string): never => {
  throw new EnvelopeError(404, "not_found", `${what} not found`)
}
