import { describe, expect, it } from "vitest"
import { ReportStore, severityOf, validateReport } from "../src/reports.ts"

const now = new Date("2026-09-30T12:30:00Z")

const input = {
  districtId: "lat-phrao",
  landmark: "ปากซอยลาดพร้าว 71",
  depthCm: 35,
  seenAt: new Date("2026-09-30T12:00:00Z")
}

describe("ReportStore", () => {
  // RPT-REQ-001 AC3
  it("gives every report its own id", () => {
    const store = new ReportStore()
    const a = store.add(input, now)
    const b = store.add(input, now)
    expect(a.id).not.toBe("")
    expect(a.id).not.toBe(b.id)
  })

  it("records when the report was received", () => {
    const store = new ReportStore()
    expect(store.add(input, now).receivedAt).toEqual(now)
  })

  // RPT-REQ-008 AC4
  it("lists only reports for the given district", () => {
    const store = new ReportStore()
    store.add(input, now)
    store.add({ ...input, districtId: "chatuchak", landmark: "หน้าตลาดนัด" }, now)
    const listed = store.listFor("lat-phrao")
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71" })
  })
})

const valid = { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: "2026-09-30T12:00:00Z" }

function fieldsWithErrors(body: unknown): string[] {
  const result = validateReport(body, now)
  return result.ok ? [] : result.errors.map((e) => e.field)
}

describe("validateReport: body and district", () => {
  it("accepts a valid report", () => {
    expect(validateReport(valid, now)).toEqual({
      ok: true,
      value: { districtId: "lat-phrao", landmark: "ปากซอยลาดพร้าว 71", depthCm: 35, seenAt: new Date("2026-09-30T12:00:00Z") }
    })
  })

  // RPT-REQ-002 AC1
  it.each([undefined, null, [], "report", 42])("rejects a body that is not an object: %j", (body) => {
    expect(fieldsWithErrors(body)).toEqual(["body"])
  })

  // RPT-REQ-002 AC2, AC3
  it.each(["atlantis", "", "Lat-Phrao", 1, null])("rejects districtId %j", (districtId) => {
    expect(fieldsWithErrors({ ...valid, districtId })).toEqual(["districtId"])
  })

  // RPT-REQ-002 AC4
  it("lists every bad field, not just the first", () => {
    expect(fieldsWithErrors({ ...valid, districtId: "atlantis", depthCm: 0 })).toEqual(["districtId", "depthCm"])
  })

  // RPT-REQ-012 AC1, RPT-REQ-007 AC2
  it("drops fields the client should not set", () => {
    const result = validateReport({ ...valid, phone: "0812345678", id: "mine", severity: "wet", receivedAt: "x" }, now)
    expect(result.ok && Object.keys(result.value).sort()).toEqual(["depthCm", "districtId", "landmark", "seenAt"])
  })
})

describe("validateReport: depthCm", () => {
  // RPT-REQ-005 AC1
  it.each([1, 200])("accepts %d cm", (depthCm) => {
    expect(fieldsWithErrors({ ...valid, depthCm })).toEqual([])
  })

  // RPT-REQ-005 AC2, AC3, AC4
  it.each([0, 201, -5, 50.5, "50", null, NaN, true, Infinity])("rejects %j", (depthCm) => {
    expect(fieldsWithErrors({ ...valid, depthCm })).toEqual(["depthCm"])
  })
})

describe("validateReport: seenAt", () => {
  const at = (seenAt: unknown) => fieldsWithErrors({ ...valid, seenAt })
  const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString()

  // RPT-REQ-006 AC1
  it("accepts Z and +07:00, and they mean the same instant", () => {
    const z = validateReport({ ...valid, seenAt: "2026-09-30T12:00:00Z" }, now)
    const bkk = validateReport({ ...valid, seenAt: "2026-09-30T19:00:00+07:00" }, now)
    expect(z.ok && bkk.ok && z.value.seenAt.getTime() === bkk.value.seenAt.getTime()).toBe(true)
  })

  it("accepts optional milliseconds", () => {
    expect(at("2026-09-30T12:00:00.250Z")).toEqual([])
  })

  // RPT-REQ-006 AC2, AC3
  it.each([
    "2026-09-30T19:00:00", // no timezone
    "2026-09-30T19:00+07:00", // no seconds
    "2026-09-30", // date only
    "Wed Sep 30 2026 19:00:00 GMT+0700", // Date.parse accepts it, we do not
    "เมื่อกี้",
    "2026-02-30T12:00:00Z", // no such day
    "2026-09-30T24:00:00Z", // no such hour
    1790000000000,
    null
  ])("rejects %j", (seenAt) => {
    expect(at(seenAt)).toEqual(["seenAt"])
  })

  // RPT-REQ-006 AC4
  it("allows 5 minutes of clock skew into the future, not a second more", () => {
    expect(at(iso(5 * 60_000))).toEqual([])
    expect(at(iso(5 * 60_000 + 1000))).toEqual(["seenAt"])
  })

  // RPT-REQ-006 AC5 (changed: 3 h, the report lifetime, instead of 6 h)
  it("rejects a report that would already have expired", () => {
    expect(at(iso(-3 * 60 * 60_000 + 1000))).toEqual([])
    expect(at(iso(-3 * 60 * 60_000))).toEqual(["seenAt"])
  })
})

describe("validateReport: landmark", () => {
  const landmarkOf = (landmark: unknown) => {
    const result = validateReport({ ...valid, landmark }, now)
    return result.ok ? result.value.landmark : result.errors
  }

  // RPT-REQ-003 AC1
  it("keeps the landmark trimmed", () => {
    expect(landmarkOf("  ปากซอยลาดพร้าว 71  ")).toBe("ปากซอยลาดพร้าว 71")
  })

  // RPT-REQ-003 AC2, AC5
  it.each(["", "   ", 71, null, undefined])("rejects %j", (landmark) => {
    expect(fieldsWithErrors({ ...valid, landmark })).toEqual(["landmark"])
  })

  // RPT-REQ-003 AC3 (counted in code points, so Thai vowel and tone marks count)
  it("allows 100 code points, not 101", () => {
    expect(fieldsWithErrors({ ...valid, landmark: "น".repeat(100) })).toEqual([])
    expect(fieldsWithErrors({ ...valid, landmark: "น".repeat(101) })).toEqual(["landmark"])
    expect(fieldsWithErrors({ ...valid, landmark: "น้ำ".repeat(34) })).toEqual(["landmark"]) // 102 code points
  })

  // RPT-REQ-003 AC4
  it.each(["ปากซอย\n71", "ปากซอย\u000071", "ปากซอย\u007f71", "ปากซอย\t71"])("rejects control characters in %j", (landmark) => {
    expect(fieldsWithErrors({ ...valid, landmark })).toEqual(["landmark"])
  })

  // RPT-REQ-003 AC6
  it("keeps markup as plain text", () => {
    expect(landmarkOf("<script>alert(1)</script>")).toBe("<script>alert(1)</script>")
  })
})

describe("validateReport: phone numbers in the landmark", () => {
  // RPT-REQ-004 AC1, AC2
  it.each(["หน้าร้าน โทร 081-234-5678", "0812345678", "๐๘๑ ๒๓๔ ๕๖๗๘", "โทร 02-123-4567", "+66 81 234 5678"])(
    "rejects %j",
    (landmark) => {
      expect(fieldsWithErrors({ ...valid, landmark })).toEqual(["landmark"])
    }
  )

  // RPT-REQ-004 AC3
  it.each(["ปากซอยลาดพร้าว 71", "เลขที่ 1234/56", "ลาดพร้าว 101 ซอย 12345"])("accepts %j", (landmark) => {
    expect(fieldsWithErrors({ ...valid, landmark })).toEqual([])
  })

  // Known false positive of the spec's rule (review item 4): separate numbers join once spaces are stripped.
  it("rejects two numbers that add up to 9 digits (known false positive)", () => {
    expect(fieldsWithErrors({ ...valid, landmark: "ซอย 71 1234567" })).toEqual(["landmark"])
  })

  // RPT-REQ-004 AC4
  it("does not repeat the number in the error", () => {
    const result = validateReport({ ...valid, landmark: "โทร 081-234-5678" }, now)
    expect(JSON.stringify(result)).not.toMatch(/081|234|5678/)
  })
})

describe("severityOf", () => {
  // RPT-REQ-007 AC1
  it.each([
    [1, "wet"],
    [9, "wet"],
    [10, "caution"],
    [29, "caution"],
    [30, "no-sedan"],
    [49, "no-sedan"],
    [50, "danger"],
    [200, "danger"]
  ])("%d cm is %s", (depthCm, severity) => {
    expect(severityOf(depthCm)).toBe(severity)
  })
})

describe("ReportStore.active", () => {
  const at = (iso: string) => new Date(iso)

  // RPT-REQ-009 AC1
  it("shows a report until 3 hours after it was seen", () => {
    const store = new ReportStore()
    store.add(input, now) // seen 12:00Z
    expect(store.active("lat-phrao", at("2026-09-30T14:59:59Z"))).toHaveLength(1)
    expect(store.active("lat-phrao", at("2026-09-30T15:00:00Z"))).toHaveLength(0)
  })

  // RPT-REQ-009 AC3
  it("counts the 3 hours from when it was seen, not when it was sent", () => {
    const store = new ReportStore()
    store.add({ ...input, seenAt: at("2026-09-30T10:00:00Z") }, now) // sent 12:30Z
    expect(store.active("lat-phrao", at("2026-09-30T12:59:59Z"))).toHaveLength(1)
    expect(store.active("lat-phrao", at("2026-09-30T13:00:00Z"))).toHaveLength(0)
  })

  // RPT-REQ-008 AC7
  it("lists the most recently seen first", () => {
    const store = new ReportStore()
    store.add({ ...input, landmark: "A", seenAt: at("2026-09-30T11:00:00Z") }, now)
    store.add({ ...input, landmark: "B", seenAt: at("2026-09-30T12:20:00Z") }, now)
    store.add({ ...input, landmark: "C", seenAt: at("2026-09-30T11:40:00Z") }, now)
    expect(store.active("lat-phrao", now).map((r) => r.landmark)).toEqual(["B", "C", "A"])
  })

  it("forgets expired reports when a new one arrives", () => {
    const store = new ReportStore()
    store.add(input, now)
    store.add({ ...input, seenAt: at("2026-09-30T15:00:00Z") }, at("2026-09-30T15:00:00Z"))
    expect(store.listFor("lat-phrao")).toHaveLength(1)
  })
})
