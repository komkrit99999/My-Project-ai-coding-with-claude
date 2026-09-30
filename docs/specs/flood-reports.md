# Spec: รายงานจุดน้ำท่วมจากคนในพื้นที่

> ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ

- Intent: [`docs/intent/flood-reports.md`](../intent/flood-reports.md)
- ออกแบบภายใต้ Skill `security-baseline` ดูหัวข้อ [Security baseline mapping](#security-baseline-mapping)
- เวลาในตัวอย่างทั้งหมด ใช้ `now = 2026-09-30T12:30:00Z` (19:30 เวลากรุงเทพฯ) เหมือนใน `tests/app.test.ts`

## Requirements

### RPT-REQ-001 ส่งรายงานที่ถูกต้องได้

`POST /reports` รับ JSON ที่มี `districtId`, `landmark`, `depthCm`, `seenAt` ถ้าข้อมูลถูกต้องทั้งหมด ให้บันทึกและตอบ `201`

- **AC1** body ถูกต้อง → `status 201`, body มี `notice: NOTICE` และ `report` ที่มี `id` (ไม่ว่าง), `districtId`, `landmark`, `depthCm`, `severity`, `seenAt` และ `expiresAt` เป็นเวลากรุงเทพฯ (`+07:00`)
- **AC2** `seenAt: "2026-09-30T12:00:00Z"` → `report.seenAt === "2026-09-30T19:00:00+07:00"` และ `report.expiresAt === "2026-09-30T22:00:00+07:00"`
- **AC3** ส่งสองครั้งด้วย body เดียวกัน → ได้ `id` ไม่ซ้ำกัน
- **AC4** response ไม่มี IP หรือ field ที่ client ส่งมาเกินจากสี่ field ข้างบน

### RPT-REQ-002 ตรวจ body และเขต

- **AC1** body ไม่ใช่ object (`undefined`, `null`, array, string, number) → `400` และ `errors: [{ field: "body" }]`
- **AC2** `districtId` ไม่มีใน `src/districts.ts` เช่น `"atlantis"` → `400` และ `errors` มี `{ field: "districtId", message }` (`error` เป็นค่ากลาง `"invalid report"` เสมอ)
- **AC3** `districtId` ไม่ใช่ string → `400`
- **AC4** body ที่ผิดหลาย field → `400` และ `errors` รายชื่อทุก field ที่ผิด (ไม่หยุดที่ field แรก)

### RPT-REQ-003 ตรวจจุดสังเกต

`landmark` ต้องเป็น string หลัง trim แล้วยาว 1–100 ตัวอักษร นับเป็น code point (`[...s].length`) เพื่อให้ภาษาไทยนับตรงกับที่ตาเห็นโดยประมาณ

- **AC1** `"ปากซอยลาดพร้าว 71"` → ผ่าน และเก็บค่าหลัง trim
- **AC2** `""` หรือ `"   "` → `400`
- **AC3** ยาว 100 code point → ผ่าน, 101 → `400`
- **AC4** มี control character (`U+0000–U+001F`, `U+007F`) เช่น `"\n"` → `400`
- **AC5** ไม่ใช่ string → `400`
- **AC6** มี `<script>` → ผ่าน (API ตอบเป็น JSON และเก็บข้อความตามที่ส่งมา การ escape เป็นหน้าที่ของฝั่งที่แสดงผล HTML) แต่ต้องคืนค่ากลับเป็น string เดิม ไม่ถูกตีความ

### RPT-REQ-004 ปฏิเสธจุดสังเกตที่มีเบอร์โทร

ถ้าตัดช่องว่างและ `-` ออกแล้ว มีตัวเลข (อารบิกหรือเลขไทย `๐–๙`) ติดกันตั้งแต่ 9 หลักขึ้นไป ให้ถือว่าเป็นเบอร์โทร

- **AC1** `"หน้าร้าน โทร 081-234-5678"` → `400` และ `errors[].message` ของ `landmark` บอกให้ลบเบอร์โทรออก
- **AC2** `"๐๘๑ ๒๓๔ ๕๖๗๘"` → `400`
- **AC3** `"ปากซอยลาดพร้าว 71"`, `"เลขที่ 1234/56"` → ผ่าน
- **AC4** ข้อความใน error และใน log ไม่มีตัวเลขหรือ landmark ที่ส่งมา

### RPT-REQ-005 ตรวจความลึก

`depthCm` ต้องเป็นจำนวนเต็มชนิด number ในช่วง 1–200

- **AC1** `1` และ `200` → ผ่าน
- **AC2** `0`, `201`, `-5` → `400`
- **AC3** `50.5` → `400` (ไม่ปัดเศษ)
- **AC4** `"50"`, `null`, `NaN`, `true` → `400`

### RPT-REQ-006 ตรวจเวลาที่เห็น

`seenAt` ต้องเป็น string รูปแบบ `YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:mm)` เท่านั้น (ต้องมีวินาทีและ timezone ปฏิเสธวันหรือเวลาที่ไม่มีจริง เช่น `2026-02-30`) เก็บภายในเป็น `Date` (UTC)

- **AC1** `"2026-09-30T19:00:00+07:00"` และ `"2026-09-30T12:00:00Z"` → ผ่าน และเก็บเป็นเวลาเดียวกัน
- **AC2** ไม่มี timezone เช่น `"2026-09-30T19:00:00"` → `400` (ไม่เดาว่าเป็นเวลาไหน)
- **AC3** แปลงไม่ได้ เช่น `"เมื่อกี้"` หรือเป็น number → `400`
- **AC4** `now + 5 นาที` พอดี → ผ่าน, `now + 5 นาที + 1 วินาที` → `400`
- **AC5** รายงานที่จะหมดอายุทันทีถูกปฏิเสธ: `now − 3 ชั่วโมง` พอดี → `400`, `now − 3 ชั่วโมง + 1 วินาที` → ผ่าน (เดิม 6 ชม. เปลี่ยนเพื่อไม่ให้มีรายงานที่ได้ `201` แต่ไม่มีใครเห็น)

### RPT-REQ-007 คำนวณระดับความรุนแรง

ระบบคำนวณเองจาก `depthCm` ถ้า client ส่ง `severity` มา ให้เพิกเฉย

| `depthCm` | `severity` | `severityLabelTh` |
| --------- | ---------- | ----------------- |
| 1–9 | `"wet"` | เปียก ผ่านได้ |
| 10–29 | `"caution"` | รถเล็กควรระวัง |
| 30–49 | `"no-sedan"` | รถเก๋งไม่ควรผ่าน |
| 50–200 | `"danger"` | อันตราย ไม่ควรผ่าน |

- **AC1** ขอบของแต่ละช่วง `9, 10, 29, 30, 49, 50` ได้ระดับตามตาราง
- **AC2** ส่ง `severity: "wet"` มากับ `depthCm: 80` → ได้ `"danger"`

### RPT-REQ-008 แสดงรายงานในหน้าเขต

`GET /districts/:id` เพิ่ม field `reports` และ `reportsNotice` เข้าไปใน response เดิม field เดิมทั้งหมดต้องยังเหมือนเดิม

- **AC1** มีรายงานที่ยังไม่หมดอายุในเขตนั้น → `reports` มีรายการนั้น พร้อม `landmark`, `depthCm`, `severity`, `severityLabelTh`, `seenAt`, `expiresAt`, `minutesAgo`, `reportCount`, `source: "user-reported"`
- **AC2** `reportsNotice === "รายงานจากประชาชน ยังไม่ได้ตรวจสอบ ไม่ใช่ประกาศเตือนภัยทางการ"` ต้องมีเสมอ แม้ `reports` จะว่าง
- **AC3** ไม่มีรายงาน → `reports: []`
- **AC4** รายงานของเขตอื่นไม่ปรากฏ
- **AC5** `stations` ไม่เปลี่ยนเพราะมีรายงาน (test เดิมใน `tests/app.test.ts` ต้องผ่านทั้งหมดโดยไม่แก้)
- **AC6** `seenAt = 12:00Z`, `now = 12:30Z` → `minutesAgo === 30`
- **AC7** เรียงตาม `seenAt` ใหม่สุดก่อน
- **AC8** รายงานที่ `seenAt` มากกว่า `now` (ส่งมาในช่วงเผื่อ 5 นาที) แสดงผลโดยมี `minutesAgo: 0` ไม่ติดลบ

### RPT-REQ-009 รายงานหมดอายุ

รายงานยังมีผลเมื่อ `now < seenAt + 3 ชั่วโมง`

- **AC1** `seenAt = 12:00Z`: ที่ `now = 14:59:59Z` ยังแสดง, ที่ `now = 15:00:00Z` ไม่แสดง
- **AC2** รายงานที่หมดอายุไม่นับใน `reportCount`
- **AC3** การหมดอายุคิดจาก `seenAt` ไม่ใช่จากเวลาที่ส่ง (ส่งตอน 12:30Z ด้วย `seenAt = 10:00Z` → หมดอายุ 13:00Z)

### RPT-REQ-010 รวมรายงานซ้ำ

รายงานที่อยู่**เขตเดียวกัน**และมี**จุดสังเกตตรงกันหลัง normalize** แสดงเป็นรายการเดียว

normalize คือ แปลงเป็น Unicode NFC → trim → ยุบช่องว่างที่ติดกันเหลือช่องเดียว → ตัวพิมพ์เล็ก

- **AC1** `"ปากซอย 71"` กับ `"  ปากซอย   71 "` ในเขตเดียวกัน → 1 รายการ `reportCount: 2`
- **AC2** `"Central Ladprao"` กับ `"central ladprao"` → รวมกัน
- **AC3** จุดสังเกตเดียวกันแต่คนละเขต → ไม่รวม
- **AC4** รายการที่รวมแล้วใช้ `landmark`, `depthCm`, `severity`, `seenAt`, `expiresAt` ของรายงานที่ `seenAt` **ใหม่สุด** (ไม่ใช่รายงานที่ส่งล่าสุด)
- **AC5** ถ้ารายงานใหม่สุดในกลุ่มหมดอายุไปแล้ว แต่ยังมีรายงานที่ยังไม่หมดอายุเหลืออยู่ในกลุ่ม ให้แสดงจากรายงานที่ยังไม่หมดอายุที่ใหม่สุด (กรณีนี้เกิดได้ไม่บ่อย แต่ต้องไม่แสดงข้อมูลที่หมดอายุแล้ว)
- **AC6** รายงานทุกฉบับยังเก็บแยกกันใน store ส่วนการรวมเกิดตอนแสดงผลเท่านั้น

### RPT-REQ-011 จำกัดจำนวนครั้งต่อ IP

นับทุกคำขอ `POST /reports` ต่อ IP แบบ sliding window **5 ครั้งต่อ 10 นาที** นับทั้งคำขอที่ผ่านและที่ผิด เพื่อกันการยิงลองผิดลองถูก

- **AC1** IP เดียวกันส่ง 5 ครั้งใน 10 นาที → ผ่านทั้งหมด (ตามความถูกต้องของ body)
- **AC2** ครั้งที่ 6 → `429` พร้อม `retryAfterSeconds` (จำนวนเต็ม > 0) และไม่บันทึกรายงาน
- **AC3** IP อื่นไม่ได้รับผลกระทบ
- **AC4** หลังครั้งแรกผ่านไป 10 นาที → ส่งได้อีก
- **AC5** การตรวจ rate limit เกิดก่อนการตรวจ body
- **AC6** `GET` ไม่ถูกนับ
- **AC7** คำขอที่ได้ `429` ไม่ถูกนับเพิ่ม ครบ 10 นาทีหลังครั้งเก่าสุดพอดีส่งได้อีก `retryAfterSeconds` ปัดขึ้นและไม่ต่ำกว่า 1

### RPT-REQ-012 ไม่เก็บ ไม่คืน และไม่ log ข้อมูลส่วนบุคคล

- **AC1** store เก็บเฉพาะ `id`, `districtId`, `landmark`, `depthCm`, `seenAt`, `receivedAt` เท่านั้น field อื่นที่ client ส่งมา (เช่น `phone`, `name`) ถูกทิ้งไปโดยไม่ error
- **AC2** IP ใช้ใน rate limiter เท่านั้น ไม่เก็บลง store ไม่อยู่ใน response ใดๆ และไม่ log ส่วนรายการ IP ที่หมดช่วง 10 นาทีแล้วถูกลบออกจากหน่วยความจำ
- **AC3** log ของการส่งรายงานมีเฉพาะ `id` และ `districtId` (test: spy `console.log`/`console.error` แล้วส่ง landmark ที่มีเบอร์โทรและ body ที่มี `phone` ตรวจว่าไม่มีตัวเลขเหล่านั้นใน log)

### RPT-REQ-013 ทุก response ของรายงานแนบ NOTICE

- **AC1** response ของ `POST /reports` ทุก status (`201`, `400`, `413`, `429`) มี `notice: NOTICE`
- **AC2** `GET /districts/:id` ยังมี `notice` เหมือนเดิม และมี `reportsNotice` เพิ่มตาม RPT-REQ-008

### RPT-REQ-014 จำกัดขนาด body

- **AC1** body ใหญ่กว่า 10 KB → `413` และหยุดอ่านต่อ (test ที่ระดับ `server.ts` หรือฟังก์ชันอ่าน body ที่แยกออกมา)
- **AC2** JSON ผิดรูปแบบยังได้ `400` เหมือนเดิม

## Design

### Data model

```ts
// src/reports.ts
export type Severity = "wet" | "caution" | "no-sedan" | "danger"

/** One submitted report, as stored. No personal data, no IP. */
export type Report = {
  id: string          // crypto.randomUUID()
  districtId: string
  landmark: string    // trimmed, as the reporter typed it
  depthCm: number     // integer, 1–200
  seenAt: Date        // UTC
  receivedAt: Date    // UTC, ctx.now at submit time
}

/** What GET /districts/:id shows: one row per district + normalized landmark. */
export type ReportSummary = {
  landmark: string
  depthCm: number
  severity: Severity
  severityLabelTh: string
  seenAt: string      // Bangkok ISO
  expiresAt: string   // Bangkok ISO
  minutesAgo: number
  reportCount: number
  source: "user-reported"
}
```

ค่าคงที่รวมไว้ที่เดียวใน `src/reports.ts`: `MAX_LANDMARK_LENGTH = 100`, `MIN_DEPTH_CM = 1`, `MAX_DEPTH_CM = 200`, `FUTURE_TOLERANCE_MS = 5 นาที`, `REPORT_TTL_MS = 3 ชม.` (ใช้เป็นขอบเขตอายุของ `seenAt` ด้วย)

### Modules

| Module | Interface | หน้าที่ |
| ------ | --------- | ------- |
| `src/reports.ts` | `validateReport(body, now): { ok: true; value } \| { ok: false; errors }` | ตรวจ body ทั้งหมดตาม RPT-REQ-002–006 คืนเฉพาะ field ที่อนุญาต |
| | `severityOf(depthCm): Severity` | RPT-REQ-007 |
| | `class ReportStore { add(input, now): Report; activeSummaries(districtId, now): ReportSummary[] }` | เก็บใน `Map`/array ในหน่วยความจำ ลบรายงานที่หมดอายุทุกครั้งที่ `add` รวมรายงานซ้ำตอน `activeSummaries` |
| `src/rate-limit.ts` | `class RateLimiter { constructor(limit, windowMs); hit(key, now): { allowed: true } \| { allowed: false; retryAfterSeconds } }` | sliding window ต่อ key ลบ key ที่ว่างแล้ว |

### API

**เพิ่ม `POST /reports`**

```jsonc
// request
{ "districtId": "lat-phrao", "landmark": "ปากซอยลาดพร้าว 71", "depthCm": 35, "seenAt": "2026-09-30T19:00:00+07:00" }

// 201
{
  "notice": "...",
  "report": {
    "id": "3f0c…", "districtId": "lat-phrao", "landmark": "ปากซอยลาดพร้าว 71",
    "depthCm": 35, "severity": "no-sedan",
    "seenAt": "2026-09-30T19:00:00+07:00", "expiresAt": "2026-09-30T22:00:00+07:00"
  }
}

// 400
{ "notice": "...", "error": "invalid report", "errors": [{ "field": "depthCm", "message": "ต้องเป็นจำนวนเต็ม 1–200 เซนติเมตร" }] }

// 429
{ "notice": "...", "error": "too many reports", "retryAfterSeconds": 412 }
```

**เปลี่ยน `GET /districts/:id`** (เพิ่ม field อย่างเดียว)

```jsonc
{
  "notice": "...", "district": { … }, "stations": [ … ],   // เหมือนเดิม
  "reportsNotice": "รายงานจากประชาชน ยังไม่ได้ตรวจสอบ ไม่ใช่ประกาศเตือนภัยทางการ",
  "reports": [
    { "landmark": "ปากซอยลาดพร้าว 71", "depthCm": 35, "severity": "no-sedan", "severityLabelTh": "รถเก๋งไม่ควรผ่าน",
      "seenAt": "2026-09-30T19:00:00+07:00", "expiresAt": "2026-09-30T22:00:00+07:00",
      "minutesAgo": 30, "reportCount": 2, "source": "user-reported" }
  ]
}
```

ส่วน summary ไม่มี `id` ของรายงาน เพราะหนึ่งรายการอาจรวมมาจากหลายรายงาน

### Context

```ts
export type Context = {
  now: Date
  ip?: string              // จาก req.socket.remoteAddress เท่านั้น
  reports?: ReportStore
  limiter?: RateLimiter
}
```

- `server.ts` สร้าง `ReportStore` และ `RateLimiter(5, 10 นาที)` **ครั้งเดียว** ตอนเริ่ม แล้วส่งให้ทุกคำขอ
- test สร้าง instance ใหม่ต่อ test เพื่อไม่ให้ state รั่วข้าม test
- ถ้าไม่ได้ส่ง `reports` มา `GET /districts/:id` คืน `reports: []` เพื่อให้ test เดิมผ่านโดยไม่ต้องแก้ ส่วน `POST /reports` ที่ไม่มี store หรือ limiter คืน `500` (เป็นความผิดของการตั้งค่า ไม่ใช่ของ client)
- **ไม่อ่าน `X-Forwarded-For`** เพราะ client ปลอมได้ ถ้า `ip` ไม่มีค่า ให้นับรวมใน key `"unknown"`

### ไฟล์ที่ต้องแก้

| ไฟล์ | การเปลี่ยนแปลง |
| ---- | -------------- |
| `src/reports.ts` | **ใหม่** type, ค่าคงที่, `validateReport`, `severityOf`, `normalizeLandmark`, `ReportStore` |
| `src/rate-limit.ts` | **ใหม่** `RateLimiter` |
| `src/app.ts` | เพิ่ม route `POST /reports`, เพิ่ม `reports`/`reportsNotice` ใน `GET /districts/:id`, ขยาย `Context` |
| `src/server.ts` | สร้าง store และ limiter, ส่ง `ip` จาก socket, จำกัด body 10 KB → `413`, log เฉพาะ `id` และ `districtId` |
| `tests/reports.test.ts` | **ใหม่** unit test ของ validation, severity, store, การรวม, การหมดอายุ |
| `tests/rate-limit.test.ts` | **ใหม่** |
| `tests/app.test.ts` | เพิ่ม test ของ route ใหม่ **ห้ามแก้ test เดิม** |
| `README.md` | เพิ่ม `POST /reports` ในส่วนตัวอย่าง `curl` และตารางไฟล์ |

ไฟล์ที่ห้ามแตะ: `data/stations.json`, `src/stations.ts`, `src/districts.ts`

## Edge cases

| # | กรณี | ผลที่ต้องการ | Req |
| - | ---- | ------------ | --- |
| 1 | `seenAt` ไม่มี timezone เช่น `"2026-09-30T19:00:00"` | `400` ไม่เดาว่าเป็น UTC หรือเวลากรุงเทพฯ | 006 |
| 2 | `seenAt` อยู่ในอนาคตไม่เกิน 5 นาที (นาฬิกามือถือเร็ว) | รับได้ แสดง `minutesAgo: 0` ไม่ติดลบ | 006, 008 |
| 3 | ส่งรายงานเก่า (`seenAt` 2 ชม. 50 นาทีก่อน) | รับได้ แต่จะหมดอายุในอีก 10 นาที | 009 |
| 4 | จุดเดียวกันมีรายงานสองฉบับ ฉบับที่ส่งทีหลังมี `seenAt` เก่ากว่า | แสดงความลึกจากฉบับที่ `seenAt` ใหม่กว่า | 010 |
| 5 | ในกลุ่มที่รวมกัน ฉบับใหม่สุดยังไม่หมดอายุ แต่ฉบับเก่าหมดแล้ว | `reportCount` นับเฉพาะที่ยังไม่หมดอายุ | 009, 010 |
| 6 | เบอร์โทรเขียนด้วยเลขไทย หรือเว้นวรรคหรือขีดคั่น | `400` | 004 |
| 7 | จุดสังเกตมีเลขซอยหรือบ้านเลขที่ (`"ซอย 71"`, `"1234/56"`) | ผ่าน ไม่ถือเป็นเบอร์โทร | 004 |
| 8 | `depthCm` เป็นทศนิยม `50.5` หรือ string `"50"` | `400` ไม่ปัดเศษและไม่แปลงชนิด | 005 |
| 9 | client ส่ง `severity`, `phone`, `id` มาด้วย | ไม่ใช้ `severity` กับ `id` ที่ส่งมา ทิ้ง `phone` ไม่เก็บ ไม่ log | 007, 012 |
| 10 | IP เดียวกันส่ง body ผิด 5 ครั้ง แล้วส่ง body ถูก | ครั้งที่ 6 ได้ `429` แม้ body ถูก | 011 |
| 11 | หลายคนใช้ IP เดียวกัน (Wi-Fi คอนโด หรือ CGNAT ของมือถือ) | ถูกนับรวมกัน เป็นข้อจำกัดที่ยอมรับได้ในรอบนี้ | 011 |
| 12 | จุดสังเกตที่มี `<script>` หรือ emoji | เก็บและคืนค่าเป็น string ตามที่ส่งมา ภายใต้ 100 code point | 003 |
| 13 | body ใหญ่มาก | `413` หยุดอ่านที่ 10 KB | 014 |
| 14 | server restart | รายงานและตัวนับ rate limit หายทั้งหมด เป็นพฤติกรรมที่ยอมรับตาม intent | — |
| 15 | จุดสังเกตเดียวกันแต่คนละเขต | ไม่รวม | 010 |

## Out of scope

- หน้าเว็บหรือฟอร์ม ทำแค่ API อย่างเดียว รวมถึงปุ่มเลือกเร็ว "ข้อเท้า/เข่า/เอว"
- พิกัด lat/lng และแผนที่
- การรวมรายงานซ้ำด้วยความคล้ายของข้อความ (fuzzy) เช่น `"ปากซอย 71"` กับ `"ปากซอยลาดพร้าว 71"`
- ปุ่ม "ยืนยัน" หรือ "แจ้งว่าผิด" การตรวจโดยผู้ดูแล และการลบหรือแก้รายงาน
- บัญชีผู้ใช้ การล็อกอิน และ OTP
- endpoint สำหรับเจ้าหน้าที่หรืออาสาสมัคร
- ที่เก็บถาวร (SQLite หรือฐานข้อมูลภายนอก)
- การอ่าน `X-Forwarded-For` หรือการทำงานหลัง reverse proxy
- การตรวจหาข้อมูลส่วนบุคคลแบบอื่นนอกจากเบอร์โทร เช่น ชื่อคน หรือที่อยู่ละเอียด
- การเชื่อมต่อใดๆ กับ `flood-api.rooptanjai.com` ห้ามทั้งการเขียนและการลบ และรอบนี้ไม่มีการอ่านด้วย
- การปรับเกณฑ์ความรุนแรงและอายุรายงานให้ตรงข้อมูลจริง ยังเป็น Open question ใน intent

## Security baseline mapping

| กฎใน `security-baseline` | อยู่ใน |
| ------------------------ | ------ |
| ตรวจ input ทุกตัวที่ boundary ไม่เชื่อ client | RPT-REQ-002–007, 014 (ตรวจใน handler ก่อนเข้า store ทิ้ง field ที่ไม่รู้จัก และไม่รับ `severity`/`id` จาก client) |
| ค่าวัดเป็นจำนวนเต็มในหน่วยที่ระบุ (cm) ไม่ใช่ทศนิยม | RPT-REQ-005 |
| สิ่งที่สาธารณะส่งได้ต้องมี rate limit ต่อ IP | RPT-REQ-011 |
| ห้าม log หรือคืนข้อมูลส่วนบุคคล log เฉพาะ ID | RPT-REQ-004, 012 |
| สิ่งที่แสดงต่อสาธารณะต้องบอกว่าเป็นรายงานจากผู้ใช้ ไม่ใช่ประกาศทางการ | RPT-REQ-008 (`reportsNotice`, `source`), 013 |
