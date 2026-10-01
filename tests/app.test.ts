import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { ReportStore } from "../src/reports.ts"

const now = new Date("2026-09-30T12:30:00Z")

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

const validReport = {
  districtId: "lat-phrao",
  landmark: "ปากซอยลาดพร้าว 71",
  depthCm: 35,
  seenAt: "2026-09-30T12:00:00Z"
}

const REPORTS_NOTICE = "รายงานจากประชาชน ยังไม่ได้ตรวจสอบ ไม่ใช่ประกาศเตือนภัยทางการ"

describe("POST /reports", () => {
  it("accepts a valid report and answers 201 with Bangkok times", () => {
    const res = handle("POST", "/reports", validReport, { now, reports: new ReportStore() })
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
  })
})

describe("GET /districts/:id reports", () => {
  it("shows a submitted report in its district", () => {
    const reports = new ReportStore()
    handle("POST", "/reports", validReport, { now, reports })

    const res = handle("GET", "/districts/lat-phrao", undefined, { now, reports })

    expect(res.body).toMatchObject({
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

  it("always carries reportsNotice, with an empty list when there are no reports", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now, reports: new ReportStore() })
    expect(res.body).toMatchObject({ reportsNotice: REPORTS_NOTICE, reports: [] })
  })

  it("still works when no store is passed in", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now })
    expect(res.body).toMatchObject({ reportsNotice: REPORTS_NOTICE, reports: [] })
  })
})
