import { describe, expect, it } from "vitest"
import { handle, NOTICE, REPORTS_NOTICE } from "../src/app.ts"
import { RateLimiter } from "../src/rate-limit.ts"
import { ReportStore } from "../src/reports.ts"

const now = new Date("2026-09-30T12:30:00Z")

/** A fresh limiter per request, for tests that are not about rate limiting. */
const limiter = () => new RateLimiter(5, 10 * 60_000)

describe("GET /districts", () => {
  it("lists districts with the teaching notice", () => {
    const res = handle("GET", "/districts", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notice: NOTICE })
    expect((res.body as { districts: unknown[] }).districts.length).toBe(12)
  })
})

describe("GET /districts/:id", () => {
  it("shows the latest station reading in Bangkok time", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      district: { id: "lat-phrao", nameTh: "ลาดพร้าว" },
      stations: [{ id: "st-ladprao-01", latest: { at: "2026-09-30T19:00:00+07:00", levelCm: 104 } }]
    })
  })

  it("ignores readings after now", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now: new Date("2026-09-30T10:30:00Z") })
    expect(res.body).toMatchObject({ stations: [{ latest: { levelCm: 88 } }] })
  })

  it("returns an empty station list for a district with no stations", () => {
    const res = handle("GET", "/districts/sai-mai", undefined, { now })
    expect(res.body).toMatchObject({ stations: [] })
  })

  it("returns 404 for an unknown district", () => {
    expect(handle("GET", "/districts/atlantis", undefined, { now }).status).toBe(404)
  })
})

describe("unknown routes", () => {
  it("returns 404", () => {
    expect(handle("GET", "/nope", undefined, { now }).status).toBe(404)
  })
})

describe("POST /reports", () => {
  const body = { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T12:00:00Z" }

  // RPT-REQ-001 AC1, AC2 / RPT-REQ-013 AC1 (201)
  it("stores a report and answers 201 in Bangkok time", () => {
    const res = handle("POST", "/reports", body, { now, reports: new ReportStore(), limiter: limiter() })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      notice: NOTICE,
      report: {
        districtId: "lat-phrao",
        landmark: "ปากซอยลาดพร้าว 71",
        depthCm: 35,
        seenAt: "2026-09-30T19:00:00+07:00",
        expiresAt: "2026-09-30T22:00:00+07:00"
      }
    })
    expect((res.body as { report: { id: string } }).report.id).not.toBe("")
  })

  it("answers 500 when the server has no report store", () => {
    expect(handle("POST", "/reports", body, { now }).status).toBe(500)
  })
})

describe("GET /districts/:id reports", () => {
  const body = { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T12:00:00Z" }

  // RPT-REQ-008 AC1, AC6
  it("shows a submitted report as user-reported, apart from stations", () => {
    const reports = new ReportStore()
    handle("POST", "/reports", body, { now, reports, limiter: limiter() })
    const res = handle("GET", "/districts/lat-phrao", undefined, { now, reports })
    expect(res.body).toMatchObject({
      stations: [{ id: "st-ladprao-01", latest: { levelCm: 104 } }],
      reports: [
        {
          landmark: "ปากซอยลาดพร้าว 71",
          depthCm: 35,
          seenAt: "2026-09-30T19:00:00+07:00",
          expiresAt: "2026-09-30T22:00:00+07:00",
          minutesAgo: 30,
          source: "user-reported"
        }
      ]
    })
  })

  // RPT-REQ-008 AC2, AC3, AC5
  it("always carries the user-report notice, with an empty list when there are none", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now, reports: new ReportStore() })
    expect(res.body).toMatchObject({ reportsNotice: REPORTS_NOTICE, reports: [] })
    expect(handle("GET", "/districts/lat-phrao", undefined, { now }).body).toMatchObject({ reports: [] })
  })

  // RPT-REQ-008 AC4
  it("does not show reports from other districts", () => {
    const reports = new ReportStore()
    handle("POST", "/reports", { ...body, districtId: "chatuchak" }, { now, reports, limiter: limiter() })
    expect(handle("GET", "/districts/lat-phrao", undefined, { now, reports }).body).toMatchObject({ reports: [] })
  })
})

describe("POST /reports validation", () => {
  const body = { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T12:00:00Z" }

  // RPT-REQ-002 AC4 / RPT-REQ-013 AC1 (400)
  it("answers 400 with every bad field and the notice, and stores nothing", () => {
    const reports = new ReportStore()
    const res = handle("POST", "/reports", { ...body, districtId: "atlantis", depthCm: 50.5 }, { now, reports, limiter: limiter() })
    expect(res).toMatchObject({
      status: 400,
      body: { notice: NOTICE, error: "invalid report", errors: [{ field: "districtId" }, { field: "depthCm" }] }
    })
    expect(reports.listFor("atlantis")).toEqual([])
    expect(reports.listFor("lat-phrao")).toEqual([])
  })

  // RPT-REQ-002 AC1
  it("answers 400 when there is no body", () => {
    expect(handle("POST", "/reports", undefined, { now, reports: new ReportStore(), limiter: limiter() })).toMatchObject({
      status: 400,
      body: { errors: [{ field: "body" }] }
    })
  })

  // RPT-REQ-001 AC4, RPT-REQ-012 AC1
  it("does not echo fields it did not accept", () => {
    const res = handle("POST", "/reports", { ...body, phone: "0812345678", id: "mine" }, { now, reports: new ReportStore(), limiter: limiter() })
    const report = (res.body as { report: Record<string, unknown> }).report
    expect(Object.keys(report).sort()).toEqual(["depthCm", "districtId", "expiresAt", "id", "landmark", "seenAt", "severity"])
    expect(report.id).not.toBe("mine")
    expect(JSON.stringify(res.body)).not.toContain("0812345678")
  })
})

describe("report severity and expiry on GET /districts/:id", () => {
  const body = { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T12:00:00Z" }

  // RPT-REQ-007 AC2
  it("works out severity from depth and ignores one sent by the client", () => {
    const reports = new ReportStore()
    const posted = handle("POST", "/reports", { ...body, depthCm: 80, severity: "wet" }, { now, reports, limiter: limiter() })
    expect(posted.body).toMatchObject({ report: { severity: "danger" } })
    expect(handle("GET", "/districts/lat-phrao", undefined, { now, reports }).body).toMatchObject({
      reports: [{ depthCm: 80, severity: "danger", severityLabelTh: "อันตราย ไม่ควรผ่าน" }]
    })
  })

  // RPT-REQ-009 AC1
  it("stops showing a report 3 hours after it was seen", () => {
    const reports = new ReportStore()
    handle("POST", "/reports", body, { now, reports, limiter: limiter() })
    const later = { now: new Date("2026-09-30T15:00:00Z"), reports }
    expect(handle("GET", "/districts/lat-phrao", undefined, later).body).toMatchObject({ reports: [] })
  })

  // RPT-REQ-008 AC8
  it("never shows a negative minutesAgo for a report seen slightly in the future", () => {
    const reports = new ReportStore()
    handle("POST", "/reports", { ...body, seenAt: "2026-09-30T12:33:00Z" }, { now, reports, limiter: limiter() })
    expect(handle("GET", "/districts/lat-phrao", undefined, { now, reports }).body).toMatchObject({
      reports: [{ minutesAgo: 0 }]
    })
  })
})

describe("POST /reports rate limit", () => {
  const body = { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T12:00:00Z" }

  // RPT-REQ-011 AC1, AC2 / RPT-REQ-013 AC1 (429)
  it("refuses the 6th report from one IP in 10 minutes and does not store it", () => {
    const ctx = { now, reports: new ReportStore(), limiter: new RateLimiter(5, 10 * 60_000), ip: "203.0.113.7" }
    for (let i = 0; i < 5; i++) expect(handle("POST", "/reports", body, ctx).status).toBe(201)
    const res = handle("POST", "/reports", body, ctx)
    expect(res).toMatchObject({ status: 429, body: { notice: NOTICE, error: "too many reports" } })
    expect((res.body as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0)
    expect(ctx.reports.listFor("lat-phrao")).toHaveLength(5)
  })

  // RPT-REQ-011 AC3
  it("does not hold one IP's reports against another", () => {
    const shared = { now, reports: new ReportStore(), limiter: new RateLimiter(5, 10 * 60_000) }
    for (let i = 0; i < 5; i++) handle("POST", "/reports", body, { ...shared, ip: "203.0.113.7" })
    expect(handle("POST", "/reports", body, { ...shared, ip: "198.51.100.2" }).status).toBe(201)
  })

  // RPT-REQ-011 AC5
  it("counts invalid reports too, and checks the limit before the body", () => {
    const ctx = { now, reports: new ReportStore(), limiter: new RateLimiter(5, 10 * 60_000), ip: "203.0.113.7" }
    for (let i = 0; i < 5; i++) expect(handle("POST", "/reports", { ...body, depthCm: 0 }, ctx).status).toBe(400)
    expect(handle("POST", "/reports", body, ctx).status).toBe(429)
  })

  // RPT-REQ-011 AC6
  it("does not count GET requests", () => {
    const ctx = { now, reports: new ReportStore(), limiter: new RateLimiter(1, 10 * 60_000), ip: "203.0.113.7" }
    for (let i = 0; i < 3; i++) handle("GET", "/districts/lat-phrao", undefined, ctx)
    expect(handle("POST", "/reports", body, ctx).status).toBe(201)
  })

  // RPT-REQ-012 AC2
  it("never puts the IP in a response", () => {
    const ctx = { now, reports: new ReportStore(), limiter: new RateLimiter(1, 10 * 60_000), ip: "203.0.113.7" }
    const responses = [handle("POST", "/reports", body, ctx), handle("POST", "/reports", body, ctx)]
    responses.push(handle("GET", "/districts/lat-phrao", undefined, ctx))
    expect(JSON.stringify(responses)).not.toContain("203.0.113.7")
  })

  it("answers 500 when the server has no limiter", () => {
    expect(handle("POST", "/reports", body, { now, reports: new ReportStore() }).status).toBe(500)
  })
})
