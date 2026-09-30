import { createServer } from "node:http"
import { handle } from "./app.ts"
import { RateLimiter } from "./rate-limit.ts"
import { ReportStore } from "./reports.ts"

const port = Number(process.env.PORT ?? 3000)
const reports = new ReportStore() // one store for the life of the process
const limiter = new RateLimiter(5, 10 * 60 * 1000) // 5 reports per IP per 10 minutes

createServer((req, res) => {
  let raw = ""
  req.on("data", (chunk) => (raw += chunk))
  req.on("end", () => {
    let body: unknown = undefined
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }))
        return
      }
    }
    const path = new URL(req.url ?? "/", "http://x").pathname
    const { status, body: out } = handle(req.method ?? "GET", path, body, {
      now: new Date(),
      ip: req.socket.remoteAddress, // not X-Forwarded-For: the client can fake that
      reports,
      limiter
    })
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(out))
  })
}).listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
