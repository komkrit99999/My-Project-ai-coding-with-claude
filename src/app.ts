import { districts } from "./districts.ts"
import { REPORT_TTL_MS, ReportStore } from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown }

export type Context = { now: Date; reports?: ReportStore }

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

export const REPORTS_NOTICE = "รายงานจากประชาชน ยังไม่ได้ตรวจสอบ ไม่ใช่ประกาศเตือนภัยทางการ"

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  if (method === "POST" && path === "/reports") {
    if (!ctx.reports) return { status: 500, body: { notice: NOTICE, error: "reports store not configured" } }
    // No validation yet: the next steps add it. For now the body is trusted to have the right shape.
    const input = body as { districtId: string; landmark: string; depthCm: number; seenAt: string }
    const seenAt = new Date(input.seenAt)
    const report = ctx.reports.add({ ...input, seenAt }, ctx.now)
    return {
      status: 201,
      body: {
        notice: NOTICE,
        report: {
          id: report.id,
          districtId: report.districtId,
          landmark: report.landmark,
          depthCm: report.depthCm,
          seenAt: toBangkokIso(report.seenAt),
          expiresAt: toBangkokIso(new Date(report.seenAt.getTime() + REPORT_TTL_MS))
        }
      }
    }
  }

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
    const reports = (ctx.reports?.listFor(district.id) ?? []).map((r) => ({
      landmark: r.landmark,
      depthCm: r.depthCm,
      seenAt: toBangkokIso(r.seenAt),
      expiresAt: toBangkokIso(new Date(r.seenAt.getTime() + REPORT_TTL_MS)),
      minutesAgo: Math.max(0, Math.floor((ctx.now.getTime() - r.seenAt.getTime()) / 60_000)),
      source: "user-reported"
    }))
    return { status: 200, body: { notice: NOTICE, district, stations, reportsNotice: REPORTS_NOTICE, reports } }
  }

  return { status: 404, body: { error: "not found" } }
}
