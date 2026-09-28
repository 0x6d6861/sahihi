import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import type { z } from "zod"

/** Parse + validate a JSON body; throws 400 with issues on failure. */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" })
  }
  return validate(schema, body)
}

/** Parse + validate the query string (single values); throws 400 with issues on failure. */
export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  return validate(schema, c.req.query())
}

function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json(
        {
          error: "validation_error",
          issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 400 },
      ),
    })
  }
  return result.data
}

export function notFound(what = "Resource"): never {
  throw new HTTPException(404, { message: `${what} not found` })
}

export function conflict(message: string): never {
  throw new HTTPException(409, { message })
}

export function badRequest(message: string): never {
  throw new HTTPException(400, { message })
}

/** Client metadata recorded in the audit trail. */
export function clientMeta(c: Context) {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  return {
    ipAddress: forwarded || c.req.header("x-real-ip") || null,
    userAgent: c.req.header("user-agent")?.slice(0, 500) ?? null,
  }
}
