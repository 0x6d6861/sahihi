import { getEnv } from "@sahihi/config"
import nodemailer from "nodemailer"

export interface Email {
  to: string
  subject: string
  html: string
  text: string
  /** Where replies go (the envelope's sender for signing emails). */
  replyTo?: string
  /** Postmark message stream / tag for analytics */
  tag?: string
}

let smtp: nodemailer.Transporter | undefined

/** SMTP (Mailpit) in dev, Postmark HTTP API in production. */
export async function sendEmail(email: Email): Promise<void> {
  const env = getEnv()
  if (env.EMAIL_TRANSPORT === "postmark") {
    if (!env.POSTMARK_SERVER_TOKEN) throw new Error("POSTMARK_SERVER_TOKEN is not set")
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: env.EMAIL_FROM,
        To: email.to,
        Subject: email.subject,
        HtmlBody: email.html,
        TextBody: email.text,
        ReplyTo: email.replyTo,
        Tag: email.tag,
        MessageStream: "outbound",
      }),
    })
    if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`)
    return
  }
  smtp ??= nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false })
  await smtp.sendMail({
    from: env.EMAIL_FROM,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: email.replyTo,
  })
}
