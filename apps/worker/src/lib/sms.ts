import { getEnv } from "@sahihi/config"

/**
 * Africa's Talking SMS. Uses the sandbox host when AT_USERNAME=sandbox.
 * https://developers.africastalking.com/docs/sms/sending
 */
export async function sendSms(to: string, message: string): Promise<void> {
  const env = getEnv()
  if (!env.AT_USERNAME || !env.AT_API_KEY) {
    if (env.NODE_ENV !== "production") {
      console.warn(`[sms:dev] to=${to} message=${message}`)
      return
    }
    throw new Error("Africa's Talking is not configured")
  }
  const host =
    env.AT_USERNAME === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com"
  const body = new URLSearchParams({ username: env.AT_USERNAME, to, message })
  if (env.AT_SENDER_ID) body.set("from", env.AT_SENDER_ID)
  const res = await fetch(`https://${host}/version1/messaging`, {
    method: "POST",
    headers: {
      apiKey: env.AT_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  })
  if (!res.ok) throw new Error(`Africa's Talking ${res.status}: ${await res.text()}`)
}
