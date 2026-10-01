import { describe, expect, it } from "vitest"
import { ReportStore } from "../src/reports.ts"

const now = new Date("2026-09-30T12:30:00Z")

const input = (districtId = "lat-phrao") => ({
  districtId,
  landmark: "ปากซอยลาดพร้าว 71",
  depthCm: 35,
  seenAt: new Date("2026-09-30T12:00:00Z")
})

describe("ReportStore.add", () => {
  it("returns a report with a non-empty id", () => {
    const report = new ReportStore().add(input(), now)
    expect(report.id).not.toBe("")
  })

  it("gives two identical submissions different ids", () => {
    const store = new ReportStore()
    expect(store.add(input(), now).id).not.toBe(store.add(input(), now).id)
  })
})

describe("ReportStore.listFor", () => {
  it("returns only the reports of that district", () => {
    const store = new ReportStore()
    const mine = store.add(input("lat-phrao"), now)
    store.add(input("bang-khen"), now)

    expect(store.listFor("lat-phrao")).toEqual([mine])
  })
})
