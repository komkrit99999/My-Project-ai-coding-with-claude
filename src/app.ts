import { districts } from "./districts.ts"
import type { RateLimiter } from "./rate-limit.ts"
import {
  expiresAt,
  minutesAgo,
  SEVERITY_LABEL_TH,
  severityOf,
  validateReport,
  type Report,
  type ReportStore
} from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown }

export type Context = {
  now: Date
  /** Client IP from the socket, used only as the rate-limit key. Never stored, logged or returned. */
  ip?: string
  reports?: ReportStore
  limiter?: RateLimiter
}

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

export const REPORTS_NOTICE = "รายงานจากประชาชน ยังไม่ได้ตรวจสอบ ไม่ใช่ประกาศเตือนภัยทางการ"

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  if (method === "GET" && path === "/districts") {
    return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
  }

  const districtMatch = path.match(/^\/districts\/([a-z-]+)$/)
  if (method === "GET" && districtMatch) {
    const district = districts.get(districtMatch[1] ?? "")
    if (!district) return { status: 404, body: { error: "unknown district" } }
    const stations = stationsIn(district.id).map((s) => {
      const latest = latestReading(s, ctx.now)
      return {
        id: s.id,
        nameTh: s.nameTh,
        latest: latest ? { at: toBangkokIso(latest.at), levelCm: latest.levelCm } : null
      }
    })
    const reports = (ctx.reports?.active(district.id, ctx.now) ?? []).map((r) => ({
      landmark: r.landmark,
      depthCm: r.depthCm,
      severity: severityOf(r.depthCm),
      severityLabelTh: SEVERITY_LABEL_TH[severityOf(r.depthCm)],
      seenAt: toBangkokIso(r.seenAt),
      expiresAt: toBangkokIso(expiresAt(r)),
      minutesAgo: minutesAgo(r, ctx.now),
      source: "user-reported"
    }))
    return { status: 200, body: { notice: NOTICE, district, stations, reportsNotice: REPORTS_NOTICE, reports } }
  }

  if (method === "POST" && path === "/reports") {
    // Fail closed: without a limiter we would take unlimited reports from the public.
    if (!ctx.reports || !ctx.limiter) return { status: 500, body: { notice: NOTICE, error: "reports not configured" } }
    const hit = ctx.limiter.hit(ctx.ip ?? "unknown", ctx.now)
    if (!hit.allowed) {
      return { status: 429, body: { notice: NOTICE, error: "too many reports", retryAfterSeconds: hit.retryAfterSeconds } }
    }
    const result = validateReport(body, ctx.now)
    if (!result.ok) return { status: 400, body: { notice: NOTICE, error: "invalid report", errors: result.errors } }
    const report = ctx.reports.add(result.value, ctx.now)
    return { status: 201, body: { notice: NOTICE, report: publicReport(report) } }
  }

  return { status: 404, body: { error: "not found" } }
}

/** What the reporter gets back: no receivedAt, nothing they did not send besides the id. */
function publicReport(r: Report) {
  return {
    id: r.id,
    districtId: r.districtId,
    landmark: r.landmark,
    depthCm: r.depthCm,
    severity: severityOf(r.depthCm),
    seenAt: toBangkokIso(r.seenAt),
    expiresAt: toBangkokIso(expiresAt(r))
  }
}
