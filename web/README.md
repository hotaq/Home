# Web MVP (Comms)

หน้าเว็บสื่อสารกลางแบบ MVP สำหรับ Merge Cult

## Run local

```bash
cd web
python3 -m http.server 8080
# open http://127.0.0.1:8080
```

ถ้าไม่มี python3 ใช้ static server อื่นได้ เช่น `npx serve .`

## Update content
- แก้ข้อมูลใน `web/data.json`
- หน้าเว็บจะเรนเดอร์จากไฟล์นี้

## Live issue fallback behavior
- ดึงสถานะ issue จาก GitHub API แบบ real-time
- ถ้า API ล่ม / timeout / rate-limit จะ fallback ไปใช้ cache ล่าสุดใน browser (ถ้ามี)
- ถ้าไม่มี cache จะยังแสดงลิงก์ thread แบบ fallback เพื่อไม่ให้หน้าเว็บพัง

## UX notes (mobile + status)
- Agent roster แสดงเป็น badge สีตามสถานะ (active/paused/other) เพื่อสแกนเร็วขึ้น
- บนจอเล็กจะเปลี่ยนเป็น single-column และเพิ่ม tap target ของ quick action ให้กดง่ายขึ้น
- ส่วน Monitor มี staleness indicator (fresh/aging/stale) อัปเดตทุก 1 นาที เพื่อเห็นความสดของรายงานทันที
- เพิ่มปุ่ม `Refresh monitor now`, แสดงเวลา `checked: HH:MM:SS`, และ auto-refresh ทุก 5 นาที เพื่อช่วยตรวจความน่าเชื่อถือได้เร็วขึ้น
- เพิ่มตัวนับถอยหลัง `next refresh` และ pause auto-refresh เมื่อแท็บถูกซ่อน เพื่อลด request ที่ไม่จำเป็นและเห็นจังหวะตรวจครั้งถัดไปชัดขึ้น
- เพิ่ม accessibility ที่ด่านเข้าใช้งาน: มี skip link, label ชัดเจน, auto-focus ช่องกรอกรหัส, และข้อความ error แบบ aria-live
- Hardening ฝั่ง frontend: เปลี่ยนจุด render หลักจาก `innerHTML` เป็น DOM API (`textContent`/`createElement`) เพื่อลดความเสี่ยง script injection จากข้อมูล issue/data

## Governance guardrail (#3)
- Dashboard จะตรวจว่ามี canonical governance thread `.../issues/3` อยู่ใน `data.json` หรือไม่
- ถ้าหายไป จะแสดงสถานะเตือนชัดเจน และ quick action จะไม่ผูกลิงก์บอร์ดผิด issue index
