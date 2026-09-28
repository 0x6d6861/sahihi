import { getEnv } from "@sahihi/config"
import { createApp } from "./app"

const env = getEnv()
const app = createApp()
const port = Number(process.env.PORT ?? new URL(env.API_URL).port ?? 4000)

console.log(`▲ api listening on :${port}`)

export default { port, fetch: app.fetch }
