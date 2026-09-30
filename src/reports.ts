import { randomUUID } from "node:crypto"
import { districts } from "./districts.ts"

/** One submitted flood report, as stored. No personal data, no IP. */
export type Report = {
  id: string
  districtId: string
  landmark: string
  depthCm: number
  seenAt: Date
  receivedAt: Date
}

export type ReportInput = Pick<Report, "districtId" | "landmark" | "depthCm" | "seenAt">

/** In-memory report store. Everything is lost on restart, which the intent accepts. */
export class ReportStore {
  #reports: Report[] = []

  add(input: ReportInput, now: Date): Report {
    this.#reports = this.#reports.filter((r) => !isExpired(r, now))
    const report: Report = {
      id: randomUUID(),
      districtId: input.districtId,
      landmark: input.landmark,
      depthCm: input.depthCm,
      seenAt: input.seenAt,
      receivedAt: now
    }
    this.#reports.push(report)
    return report
  }

  /** Everything still held for a district, expired or not. */
  listFor(districtId: string): Report[] {
    return this.#reports.filter((r) => r.districtId === districtId)
  }

  /** What the public sees: unexpired reports for a district, most recently seen first. */
  active(districtId: string, now: Date): Report[] {
    return this.listFor(districtId)
      .filter((r) => !isExpired(r, now))
      .sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime())
  }
}

/** A report stops being shown this long after it was seen (not after it was sent). */
export const REPORT_TTL_MS = 3 * 60 * 60 * 1000

export function expiresAt(report: Pick<Report, "seenAt">): Date {
  return new Date(report.seenAt.getTime() + REPORT_TTL_MS)
}

function isExpired(report: Pick<Report, "seenAt">, now: Date): boolean {
  return expiresAt(report).getTime() <= now.getTime()
}

export type Severity = "wet" | "caution" | "no-sedan" | "danger"

export const SEVERITY_LABEL_TH: Record<Severity, string> = {
  wet: "เปียก ผ่านได้",
  caution: "รถเล็กควรระวัง",
  "no-sedan": "รถเก๋งไม่ควรผ่าน",
  danger: "อันตราย ไม่ควรผ่าน"
}

/** Placeholder thresholds from the intent; still to be confirmed by someone who knows flooding. */
export function severityOf(depthCm: number): Severity {
  if (depthCm >= 50) return "danger"
  if (depthCm >= 30) return "no-sedan"
  if (depthCm >= 10) return "caution"
  return "wet"
}

/** Whole minutes since the report was seen, never negative (seenAt may be a few minutes ahead of now). */
export function minutesAgo(report: Report, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - report.seenAt.getTime()) / 60_000))
}

/** Phone clocks run a little fast; allow this much of seenAt in the future. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

export const MAX_LANDMARK_LENGTH = 100

export const MIN_DEPTH_CM = 1
export const MAX_DEPTH_CM = 200

export type FieldError = { field: "body" | keyof ReportInput; message: string }

export type Validation = { ok: true; value: ReportInput } | { ok: false; errors: FieldError[] }

/**
 * Check a report body from the public. Returns only the four fields we accept,
 * so anything else the client sends (phone, id, severity) never reaches the store.
 */
export function validateReport(body: unknown, now: Date): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", message: "ต้องส่งเป็น JSON object" }] }
  }
  const b = body as Record<string, unknown>
  const errors: FieldError[] = []

  const districtId = b.districtId
  if (typeof districtId !== "string" || !districts.has(districtId)) {
    errors.push({ field: "districtId", message: "ไม่รู้จักเขตนี้" })
  }

  const landmark = typeof b.landmark === "string" ? b.landmark.trim() : undefined
  const landmarkError = checkLandmark(landmark)
  if (landmarkError) errors.push({ field: "landmark", message: landmarkError })

  const depthCm = b.depthCm
  if (typeof depthCm !== "number" || !Number.isInteger(depthCm) || depthCm < MIN_DEPTH_CM || depthCm > MAX_DEPTH_CM) {
    errors.push({ field: "depthCm", message: `ต้องเป็นจำนวนเต็ม ${MIN_DEPTH_CM}–${MAX_DEPTH_CM} เซนติเมตร` })
  }

  const seenAt = parseSeenAt(b.seenAt)
  if (!seenAt) {
    errors.push({ field: "seenAt", message: "ต้องเป็นเวลาแบบ 2026-09-30T19:00:00+07:00" })
  } else if (seenAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    errors.push({ field: "seenAt", message: "เวลาที่เห็นอยู่ในอนาคต" })
  } else if (isExpired({ seenAt }, now)) {
    errors.push({ field: "seenAt", message: "รายงานเก่าเกิน 3 ชั่วโมง" })
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { districtId: districtId as string, landmark: landmark as string, depthCm: depthCm as number, seenAt: seenAt as Date }
  }
}

const SEEN_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|[+-]\d{2}:\d{2})$/

/**
 * Parse YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:mm) strictly. Date.parse is too lenient: it accepts
 * other formats, guesses a timezone when none is given, and rolls 2026-02-30 over to March.
 */
function parseSeenAt(raw: unknown): Date | undefined {
  if (typeof raw !== "string") return undefined
  const m = SEEN_AT.exec(raw)
  if (!m) return undefined
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number]
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second, Number(m[7] ?? 0)))
  const rolledOver =
    wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour || wall.getUTCMinutes() !== minute || wall.getUTCSeconds() !== second
  if (rolledOver) return undefined
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const CONTROL_CHAR = /[\u0000-\u001f\u007f]/
const THAI_DIGIT = /[๐-๙]/g

/**
 * Nine or more digits in a row, once spaces and dashes are removed, is treated as a phone number.
 * Thai digits count too. The error never repeats what was typed.
 */
function looksLikePhone(text: string): boolean {
  const digits = text.replace(THAI_DIGIT, (d) => String(d.charCodeAt(0) - 0x0e50)).replace(/[\s-]/g, "")
  return /\d{9,}/.test(digits)
}

/** Returns an error message, or undefined when the (already trimmed) landmark is fine. */
function checkLandmark(landmark: string | undefined): string | undefined {
  if (landmark === undefined) return "ต้องเป็นข้อความ"
  // Code points, so Thai vowel and tone marks each count as one.
  const length = [...landmark].length
  if (length === 0 || length > MAX_LANDMARK_LENGTH) return `ต้องยาว 1–${MAX_LANDMARK_LENGTH} ตัวอักษร`
  if (CONTROL_CHAR.test(landmark)) return "มีอักขระควบคุม เช่น ขึ้นบรรทัดใหม่"
  if (looksLikePhone(landmark)) return "ห้ามใส่เบอร์โทรในจุดสังเกต"
  return undefined
}
