import { getEnv } from "@sahihi/config"
import { formatLogLine, type LogLevel, maskTokens, redact, shouldLog } from "@sahihi/core"

/**
 * Structured logs (docs/observability.md). One JSON line per event in production (Railway's log
 * search parses them); a short human line in development. Fields are redacted (`redact`) and
 * signing tokens masked, so a log line never carries a token, an OTP or an email.
 */
export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  child(fields: Record<string, unknown>): Logger
}

export function createLogger(service: string, base: Record<string, unknown> = {}): Logger {
  const env = getEnv()
  const pretty = env.NODE_ENV === "development"
  const write = (level: LogLevel, msg: string, fields: Record<string, unknown> = {}) => {
    if (!shouldLog(level, env.LOG_LEVEL)) return
    const all = { ...base, ...fields }
    const line = pretty
      ? `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${service} ${maskTokens(msg)}${
          Object.keys(all).length ? ` ${JSON.stringify(redact(all))}` : ""
        }`
      : formatLogLine(level, service, msg, all)
    if (level === "error" || level === "warn") console.error(line)
    else console.log(line)
  }
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger(service, { ...base, ...fields }),
  }
}
