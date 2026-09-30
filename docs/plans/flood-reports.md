# แผน: รายงานจุดน้ำท่วม (tracer bullet ก่อน)

## Context

`docs/specs/flood-reports.md` กำหนด RPT-REQ-001–014 ไว้แล้ว แต่ยังไม่มีโค้ดส่วนไหนรับรายงานได้เลย แผนนี้ทำเส้นทางที่บางที่สุดให้วิ่งผ่านครบทุกชั้นก่อน

`POST /reports` → `handle()` → `ReportStore` (in-memory ซึ่งทำหน้าที่แทน DB) → `GET /districts/:id` → test

จากนั้นค่อยเติมกติกาหลักตาม security-baseline คืนนี้ทำแค่ 8 ขั้นนี้ ส่วนที่เหลืออยู่ใน Later

**ของเดิมที่ใช้ต่อ**

- `handle()` กับ `Context` ใน `src/app.ts` เพื่อ route และส่ง `now` สำหรับ test
- `NOTICE` ใน `src/app.ts`
- `districts` ใน `src/districts.ts` สำหรับตรวจเขต
- `toBangkokIso()` ใน `src/time.ts`
- รูปแบบ test ของ vitest ใน `tests/app.test.ts` (`const now = new Date("2026-09-30T12:30:00Z")`)

**กติกาทุกขั้น**

- เขียน test ก่อนและดูให้ fail ก่อน (red) แล้วค่อยเขียนโค้ดให้ผ่าน (green)
- `npm test` และ `npm run lint` ต้องผ่านทุกขั้น
- ห้ามแก้ test เดิมใน `tests/app.test.ts`
- test สร้าง `ReportStore` และ `RateLimiter` ใหม่ทุก test

---

## ขั้นตอน

### ส่วนที่ 1: Tracer bullet (ขั้น 1–3)

**1. `ReportStore` แบบบางที่สุด**
- ไฟล์: **ใหม่** `src/reports.ts` มี type `Report`, `ReportStore.add(input, now)` และ `ReportStore.listFor(districtId)` / **ใหม่** `tests/reports.test.ts`
- ยังไม่มี validation ไม่มี severity ไม่มีการหมดอายุ
- test ที่เขียนก่อน
  - เพิ่มรายงานแล้ว `add` คืน `id` ที่ไม่ว่าง และเพิ่มสองครั้งได้ `id` ไม่ซ้ำกัน (RPT-REQ-001 AC3)
  - `listFor("lat-phrao")` ไม่มีรายงานของเขตอื่นปนมา (RPT-REQ-008 AC4)

**2. เพิ่ม route `POST /reports` และ field `reports` ใน `GET /districts/:id`**
- ไฟล์: `src/app.ts` ขยาย `Context` ให้มี `reports?: ReportStore` เพิ่ม route และเพิ่ม `reports` กับ `reportsNotice` / `tests/app.test.ts` เพิ่ม `describe` ใหม่
- test ที่เขียนก่อน
  - body ที่ถูกต้องได้ `201` พร้อม `notice`, `seenAt` และ `expiresAt` เป็นเวลากรุงเทพฯ (RPT-REQ-001 AC1, AC2 และ RPT-REQ-013 AC1 เฉพาะ 201)
  - ส่งแล้ว `GET /districts/lat-phrao` เห็นรายงานนั้น มี `source: "user-reported"` และ `minutesAgo` (RPT-REQ-008 AC1, AC6)
  - `reportsNotice` มีเสมอ ส่วน `reports: []` เมื่อไม่มีรายงาน (RPT-REQ-008 AC2, AC3)
  - test เดิมผ่านโดยไม่ได้ส่ง store เข้าไป (RPT-REQ-008 AC5)

**3. เชื่อม `server.ts` ให้วิ่งจริง**
- ไฟล์: `src/server.ts` สร้าง `ReportStore` **ครั้งเดียว** ตอนเริ่ม แล้วส่งเข้า `ctx`
- test: ไม่มี unit test เพราะ `server.ts` ยังไม่ได้ออกแบบให้ test ได้ ตรวจด้วยมือแทน: `npm run dev` แล้ว `curl -X POST localhost:3000/reports …` ต่อด้วย `curl localhost:3000/districts/lat-phrao` ต้องเห็นรายงาน
- ถึงขั้นนี้ tracer bullet ครบทุกชั้นแล้ว

### ส่วนที่ 2: กติกาหลัก (ขั้น 4–8)

**4. ตรวจ body, เขต และความลึก และทิ้ง field ที่ไม่รู้จัก**
- ไฟล์: `src/reports.ts` เพิ่ม `validateReport(body, now)` ที่คืน `{ ok, value } | { ok: false, errors }` / `src/app.ts` เรียกใช้ใน handler และคืน `400` / `tests/reports.test.ts` และ `tests/app.test.ts`
- test ที่เขียนก่อน
  - body ที่ไม่ใช่ object (RPT-REQ-002 AC1)
  - เขตที่ไม่มีหรือไม่ใช่ string (RPT-REQ-002 AC2, AC3)
  - body ที่ผิดหลาย field ต้องได้ `errors` ครบทุกตัว (RPT-REQ-002 AC4)
  - ค่า `depthCm` ที่ขอบ `0/1/200/201`, `50.5`, `"50"`, `NaN` (RPT-REQ-005 AC1–4)
  - ส่ง `phone`, `id`, `severity` มา แล้วต้องไม่ถูกเก็บและไม่อยู่ใน response (RPT-REQ-012 AC1 และ RPT-REQ-001 AC4)
  - response `400` มี `notice` (RPT-REQ-013 AC1)
- ⚠️ ต้องตัดสินก่อนเริ่มขั้นนี้: รูปแบบของ error (ข้อ 13 ในผลรีวิว) ค่าเสนอคือ `{ notice, error: "invalid report", errors: [{ field, message }] }` และใช้ `field: "body"` เมื่อ body ไม่ใช่ object

**5. ตรวจ `seenAt`**
- ไฟล์: `src/reports.ts` และ `tests/reports.test.ts`
- test ที่เขียนก่อน
  - ต้องระบุ timezone (RPT-REQ-006 AC1, AC2)
  - ค่าที่แปลงไม่ได้ และวันที่ที่ไม่มีจริงอย่าง `2026-02-30` (RPT-REQ-006 AC3)
  - ขอบ `+5 นาที` และ `−6 ชม.` ถึงระดับวินาที (RPT-REQ-006 AC4, AC5)
- ⚠️ ต้องตัดสินก่อนเริ่มขั้นนี้
  - regex ที่ยอมรับ (ข้อ 12) ค่าเสนอคือ `YYYY-MM-DDTHH:mm:ss(.sss)?(Z|±HH:mm)` แล้วเช็กย้อนว่าส่วนวันที่ตรงกับค่าที่ parse ได้
  - จะรับ `seenAt` ที่เก่า 3–6 ชม. ไหม (ข้อ 7)

**6. ตรวจจุดสังเกตและเบอร์โทร**
- ไฟล์: `src/reports.ts` และ `tests/reports.test.ts`
- test ที่เขียนก่อน
  - ตัดช่องว่างหัวท้าย ข้อความว่าง ความยาว 100/101 code point, control character, ไม่ใช่ string และ `<script>` ที่ต้องคืนค่าเดิม (RPT-REQ-003 AC1–6)
  - รูปแบบเบอร์โทร `081-234-5678`, เลขไทย `๐๘๑ ๒๓๔ ๕๖๗๘`, ที่ต้องผ่านคือ `ซอย 71` และ `1234/56` และข้อความ error ต้องไม่มีตัวเลขที่ส่งมา (RPT-REQ-004 AC1–4)
- ⚠️ ข้อ 4 ในผลรีวิว: การลบช่องว่างก่อนตรวจอาจเอาตัวเลขคนละชุดมาต่อกัน ในขั้นนี้ให้เขียน test `"ซอย 71 1234567"` ไว้ด้วย เพื่อบันทึกพฤติกรรมที่ตัดสินใจแล้ว

**7. ระดับความรุนแรงและการหมดอายุ**
- ไฟล์: `src/reports.ts` เพิ่ม `severityOf`, `REPORT_TTL_MS` และกรองรายงานที่หมดอายุใน `listFor(districtId, now)` / `src/app.ts` เพิ่ม `severity` และ `severityLabelTh`
- test ที่เขียนก่อน
  - ขอบ `9/10/29/30/49/50` (RPT-REQ-007 AC1)
  - ส่ง `severity` มาเองแล้วถูกเพิกเฉย (RPT-REQ-007 AC2)
  - `14:59:59Z` ยังแสดง, `15:00:00Z` ไม่แสดง และหมดอายุนับจาก `seenAt` (RPT-REQ-009 AC1, AC3)
  - เรียงจาก `seenAt` ใหม่สุด (RPT-REQ-008 AC7)
  - `minutesAgo` ต้องไม่ติดลบ (RPT-REQ-008 AC8)

**8. Rate limit ต่อ IP**
- ไฟล์: **ใหม่** `src/rate-limit.ts` (`RateLimiter.hit(key, now)`) / **ใหม่** `tests/rate-limit.test.ts` / `src/app.ts` (`ctx.ip`, `ctx.limiter`, ตรวจก่อน validation, `429`) / `src/server.ts` (`ip` จาก `req.socket.remoteAddress` และสร้าง `RateLimiter(5, 10 นาที)` ครั้งเดียว)
- test ที่เขียนก่อน
  - ครั้งที่ 1–5 ผ่าน ครั้งที่ 6 ได้ `429` พร้อม `retryAfterSeconds > 0` และไม่มีรายงานถูกบันทึก (RPT-REQ-011 AC1, AC2)
  - IP อื่นไม่ได้รับผลกระทบ (RPT-REQ-011 AC3)
  - ส่งได้อีกเมื่อครบ 10 นาที (RPT-REQ-011 AC4)
  - body ผิดก็ถูกนับ (RPT-REQ-011 AC5)
  - `GET` ไม่ถูกนับ (RPT-REQ-011 AC6)
  - `429` มี `notice` (RPT-REQ-013 AC1)
- ⚠️ คำตอบที่ใช้ไปก่อน (ข้อ 17): คำขอที่ได้ `429` **ไม่**นับเพิ่ม, ครบ 10 นาทีพอดีส่งได้อีก, `retryAfterSeconds` ปัดขึ้นด้วย `Math.ceil`

---

## ความเสี่ยงและเรื่องที่ยังไม่แน่ใจ

- **มีคำถามสำคัญจากการรีวิว spec ที่ยังไม่ปิด** ขั้น 4, 5 และ 8 ใช้คำตอบที่เสนอไว้ไปก่อน ถ้าตัดสินต่างออกไป ต้องแก้ test ของขั้นนั้น ส่วน spec ต้องแก้ตามให้ตรงกันก่อน merge
- **ที่อยู่ละเอียดขัดกับ baseline (ข้อ 1)** ยังไม่ได้ตัดสิน ถ้าตัดสินว่าต้องปฏิเสธบ้านเลขที่ test `1234/56` ในขั้น 6 จะเปลี่ยนจากผ่านเป็นไม่ผ่าน
- **`server.ts` ไม่มี test** ขั้น 3 และ 8 ตรวจการเชื่อมต่อได้ด้วยมือเท่านั้น ถ้าจะ test ได้ต้องแยกส่วนอ่าน body และหา IP ออกมาเป็นฟังก์ชัน (อยู่ใน Later พร้อมกับ RPT-REQ-014)
- **ข้อมูลร่วมกันข้าม test** ถ้า `Context` มี store ค่าเริ่มต้นเป็นตัวแปรระดับ module ข้อมูลจะรั่วข้าม test ต้องสร้าง instance ใหม่ในทุก test เสมอ
- **ลำดับการ validate** ขั้น 4 เปลี่ยน handler จาก "รับทุกอย่าง" เป็น "ตรวจก่อน" test ของขั้น 2 ต้องใช้ body ที่ถูกต้องครบทุก field ตั้งแต่แรก จะได้ไม่ต้องแก้ทีหลัง
- **branch และ PR** PR docs ที่ค้างอยู่ (รอ `gh auth login`) ใช้ branch `feat/flood-reports` ถ้า commit โค้ดลง branch เดียวกัน PR จะใหญ่ขึ้น เสนอให้แยก branch ใหม่ `feat/flood-reports-impl` จาก `feat/flood-reports`

## Later

- RPT-REQ-010: รวมรายงานซ้ำ (normalize, `reportCount`, ตัวตัดสินเมื่อ `seenAt` เท่ากัน) และลบ AC5 ที่เกิดขึ้นไม่ได้ออกจาก spec
- RPT-REQ-012 AC2–3: ลบ IP ที่หมดช่วงแล้ว และกำหนดว่า log อยู่ชั้นไหน พร้อม test spy log
- RPT-REQ-013: `notice` บน 400 invalid JSON และ 404 ตามที่ intent ให้ "ทุก response"
- RPT-REQ-014: จำกัด body 10 KB → `413` โดยแยกส่วนอ่าน body ออกจาก `server.ts` เพื่อให้ test ได้
- นับ IPv6 เป็นราย /64 และตั้งเพดานจำนวน key หรือจำนวนรายงาน
- ตรวจที่อยู่หรือชื่อในจุดสังเกต (รอการตัดสินข้อ 1)
- normalize `ำ`/`ํา` และลบ zero-width space
- ตัวชี้วัดแบบรวม (ข้อ 11) และ test ที่ยืนยันว่าไม่มีโค้ดเขียนข้อมูลไปที่ `flood-api.rooptanjai.com` (ข้อ 10)
- อัปเดต README (ตัวอย่าง `curl` และตารางไฟล์) และคัดลอกแผนนี้ไปเป็น `docs/plans/flood-reports.md` ตาม `cp4-plan`

## Verification

1. `npm test` ผ่านทุกขั้น รวม test เดิม 6 ตัวใน `tests/app.test.ts` โดยไม่แก้
2. `npm run lint` (`tsc --noEmit`) ผ่าน
3. หลังขั้น 3 และขั้น 8 ให้รัน `npm run dev` แล้วลองส่ง
   - `curl -X POST localhost:3000/reports -d '{"districtId":"lat-phrao","landmark":"ปากซอยลาดพร้าว 71","depthCm":35,"seenAt":"<เวลาปัจจุบัน>+07:00"}'` → `201`
   - `curl localhost:3000/districts/lat-phrao` → เห็นรายงานใน `reports`
   - ยิง POST ติดกัน 6 ครั้ง → ครั้งที่ 6 ได้ `429`
4. ทุก curl ส่งไปที่ `localhost` เท่านั้น ห้ามส่งไป `flood-api.rooptanjai.com`
