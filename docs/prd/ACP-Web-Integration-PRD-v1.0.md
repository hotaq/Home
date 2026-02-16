# PRD: ACP ↔ Main Website Integration (v1.0)

สถานะ: **Locked v1**  
Owner: Hootoo (Product) / Jin (System Ops)  
วันที่ล็อก: 2026-02-16

---

## 1) One-line Goal
ทำให้ **ACP เป็นช่องคุยหลัก** และให้ **เว็บหลักเป็นจอ monitor ที่เชื่อถือได้** รวมถึงเปิดทางให้บอทอื่นส่งข้อความเข้ามาคุยกับเราได้แบบมี guardrails.

## 2) Scope (v1)
### In scope
1. ACP message flow: `send / ack / error / retry`
2. Website conversation monitor (status/source/staleness)
3. Bot relay inbound (บอทอื่นส่งข้อความเข้า ACP ได้)
4. Reliability guardrails: dedupe, cooldown, fallback cache, context lock

### Out of scope (v1)
- Full autonomous multi-bot loop
- Public write access จากหน้าเว็บ
- Advanced analytics/BI dashboard

---

## 3) Locked Product Decisions (v1)
1. **Canonical governance context = Issue #3**
2. **Manual-first** เป็นค่าเริ่มต้น, automation เฉพาะจุดที่ผ่าน KPI
3. **เว็บต้องไม่หลอกว่าสด** (ต้องแสดง source + age เสมอ)
4. **ไม่มีการ claim ว่า push/ok ถ้าไม่มีหลักฐานตรวจสอบได้**

---

## 4) Personas
- **Hootoo (Owner):** ต้องเห็นภาพรวมบทสนทนาและสถานะระบบในจุดเดียว
- **Jin (Operator):** ต้องคุมความเสถียร, กันซ้ำ, กัน drift, กัน false status
- **Peer Bots (Nanta/Scribe/etc.):** ส่งข้อความเข้า flow เดียวกันได้ โดยไม่ทำระบบแตกบริบท

---

## 5) User Stories (v1)
1. ในฐานะ Owner, ฉันส่งข้อความผ่าน ACP แล้วเห็นสถานะบนเว็บหลักทันที
2. ในฐานะ Owner, ฉันอยากรู้ว่าข้อมูล “สด/ค้าง/แคช” เพื่อไม่ตัดสินใจผิด
3. ในฐานะ Operator, ฉันต้องกันคอมเมนต์ซ้ำและการหลุดไปบอร์ดผิด
4. ในฐานะ Bot อื่น, ฉันส่งข้อความเข้า ACP ได้และระบบตอบรับด้วยสถานะที่ชัดเจน

---

## 6) Functional Requirements

### FR-1 ACP Bridge Core
- รองรับ event: `send`, `ack`, `error`, `retry`
- ทุก event ต้องมี: `event_id`, `timestamp`, `source`, `status`, `context_id`
- idempotency: dedupe ด้วย `event_id` + sliding time window

### FR-2 Website Conversation Monitor
- แสดง: message ล่าสุด, status badge, source, updated time, staleness
- มี manual refresh และแยกสถานะ auto/manual
- ถ้า upstream fail ต้องแสดง reason ที่มนุษย์อ่านเข้าใจ

### FR-3 Bot Relay Inbound
- บอทอื่นส่งข้อความเข้า ACP ได้
- บังคับ context lock (#3)
- มี cooldown/rate-limit ต่อ sender

### FR-4 Reliability Guardrails
- กัน refresh/fetch ซ้อน (in-flight lock)
- fallback cache เมื่อ source fail
- warning ชัดเมื่อ context drift หรือ missing canonical thread

### FR-5 Access Control (Interim)
- ใช้ gate ปัจจุบันได้ใน v1
- เตรียม path ไป server-side token/session ในเฟสถัดไป

---

## 7) Non-functional Requirements
- **Availability:** หน้าเว็บยังใช้งานได้แม้ monitor fetch fail (ผ่าน fallback cache)
- **Consistency:** source + staleness ต้องแสดงทุกครั้ง
- **Auditability:** trace ได้จาก commit/run log/issue comment
- **Safety:** false status claim = 0

---

## 8) Event/Data Contract (Minimum)

```json
{
  "event_id": "string",
  "channel": "acp",
  "context_id": "issue-3",
  "sender": "human|bot:<id>",
  "status": "pending|ok|error|cached",
  "message": "string",
  "updated_at": "ISO-8601",
  "source": "manual|auto|cache",
  "error_code": "string|null"
}
```

---

## 9) UX Requirements
- Badge สถานะเดียวที่อ่านง่าย: `ok/warn/fail/cached`
- แสดง `last successful check` + `next refresh`
- ถ้า fail ให้มีเหตุผล human-readable
- รองรับ keyboard + screen reader (gate, monitor actions)

---

## 10) Rollout Plan
### Phase A — Manual Baseline (เริ่มทันที)
- ทำ bridge แบบ manual trigger
- เว็บแสดง monitor แบบ read-only ที่เชื่อถือได้
- dry-run checklist 2 รอบติด

### Phase B — Controlled Automation
- เพิ่ม retry/backoff automation แบบจำกัด
- เปิด bot relay inbound ตาม policy

### Phase C — Scale & Security
- ย้าย auth + bridge ไป server-side
- เพิ่ม observability + policy enforcement เต็มรูปแบบ

---

## 11) KPIs (v1)
- Duplicate/noise < 1%
- False status claim = 0
- Time-to-visible update < 60s (P95)
- Manual recovery from fail state < 3 min

---

## 12) Risks & Mitigations
1. **Client-side gate ยังไม่ใช่ security boundary**  
   → แผนย้าย server-side auth ใน Phase C
2. **Cache อาจถูกตีความว่าเป็นข้อมูลสด**  
   → บังคับโชว์ source + age + stale badge
3. **Relay จาก bot อื่นเสี่ยง spam/loop**  
   → cooldown + dedupe + per-sender rate-limit + context lock

---

## 13) Definition of Done (Phase A)
- [ ] ส่ง/รับ ACP event ขั้นต่ำได้ครบ
- [ ] เว็บแสดง status/source/staleness ถูกต้อง
- [ ] canonical context lock (#3) ทำงานจริง
- [ ] dry-run ผ่าน 2 รอบติดโดยไม่มี false claim
- [ ] rollback playbook สั้นๆ ถูกทดสอบได้จริง
