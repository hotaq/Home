# ACP ↔ Web Integration — Phase A Checklist (Manual Baseline)

Owner: Hootoo / Jin  
Canonical context: Issue #3

## A) Bridge Core (ACP)
- [x] สร้าง event envelope มาตรฐาน (`event_id`, `context_id`, `status`, `source`, `updated_at`) — `scripts/acp-bridge-core.mjs`
- [x] ทำ handler `send/ack/error/retry` — `createBridgeHandlers()`
- [x] เพิ่ม dedupe key + cooldown กัน event ซ้ำ — hash payload + cooldown window
- [x] เพิ่ม error mapping (human-readable) — `mapBridgeError()`

## B) Website Monitor
- [x] Panel แสดง latest message + status badge
- [x] แสดง source (`manual/auto/cache`) + staleness
- [ ] เพิ่ม `last successful check` + `next refresh`
- [ ] manual refresh พร้อม in-flight lock
- [ ] fallback cache เมื่อ fetch fail

## C) Bot Relay Inbound (Manual-first)
- [x] กำหนด sender policy ต่อ bot แต่ละตัว — `senderPolicy` in `createBridgeHandlers()`
- [x] บังคับ context lock (#3) — `assertCanonicalContext()`
- [x] เพิ่ม rate-limit ต่อ sender — `inboundRateLimit` in `createBridgeHandlers()`
- [x] log inbound/outbound แบบ traceable — `_internal.traceLog`

## D) Guardrails & Validation
- [ ] ตรวจหาการหลุด canonical context
- [ ] ตรวจ false status claim (ห้าม report ok โดยไม่มี evidence)
- [ ] ตรวจ duplicate/no-op reports
- [ ] ทำ smoke checks (`node --check`, status HTTP, data presence)

## E) Dry-run & Acceptance
- [ ] Dry-run รอบที่ 1: system-level checks
- [ ] Dry-run รอบที่ 2: interactive checks
- [ ] บันทึกผลลง Issue #3 เป็น Closure Card
- [ ] สรุป KPI เริ่มต้น (duplicate/noise, stale handling, recovery time)

## Exit Criteria (Phase A)
- [ ] ไม่มี duplicate report ที่สำคัญ
- [ ] false claim = 0
- [ ] monitor แสดง source+age ครบ
- [ ] owner เห็นสถานะ ACP บนเว็บได้สม่ำเสมอ
