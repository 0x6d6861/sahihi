import { getEnv } from "@sahihi/config"
import { initErrorTracking } from "@sahihi/infra"
import { createApp } from "./app"
import { log } from "./middleware/request-log"

const env = getEnv()
const tracking = initErrorTracking("api")
const app = createApp()
const port = Number(process.env.PORT ?? new URL(env.API_URL).port ?? 4000)

log.info(`api listening on :${port}`, { errorTracking: tracking ? "sentry" : "off" })

export default { port, fetch: app.fetch }
