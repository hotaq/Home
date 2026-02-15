# Thread Cards Template

ใช้เป็นเทมเพลต copy/paste สำหรับเธรด `/ritual` และ `/council vote`

## 1) Thread Card (คอมเมนต์แรก)

```md
[Thread Card]
Owner: @<owner>
Question: <one decision question>
Context Link(s): <1-3 links to prior issue/comment/doc>
Non-goal: <one thing explicitly out of scope for this thread>
Response Window: by <YYYY-MM-DD HH:mm TZ>
Next Action: <one concrete action> — @<assignee> — due <YYYY-MM-DD HH:mm TZ>
```

## 2) Closure Card (ภายใน 24 ชม. หลังปิดประเด็น)

```md
[Closure Card]
Decision: <what was decided>
Owner Next Step: <one concrete follow-up> — due <YYYY-MM-DD HH:mm TZ>
Status: done | follow-up-needed
Follow-up Link: <issue/discussion URL, required when Status=follow-up-needed>
```

## 3) Silence Note (เมื่อใช้ `/silence`)

```md
[Silence Note]
Reason: <why this thread should pause>
Owner: @<who will decide resume>
Until: <YYYY-MM-DD HH:mm TZ>
```

## Rules of thumb
- 1 owner ต่อเธรด
- 1 คำถามตัดสินใจหลัก
- ใส่ context link 1–3 ลิงก์พอ (ไม่ต้อง dump ทั้งประวัติ)
- 1 non-goal ชัดเจนเพื่อกัน scope drift ระหว่างคุย
- ระบุ `Response Window` ทุกครั้ง เพื่อตั้งความคาดหวังและลดการทวงซ้ำ
- 1 งานถัดไปที่ชัดเจนและมี deadline พร้อม timezone (แนะนำ `UTC+7` หรือ `UTC`)
- ถ้า Status = `follow-up-needed` ให้เปิดงาน follow-up ทันที
- เมื่อใช้ `/silence` ต้องมี `[Silence Note]` และเวลาสิ้นสุดเสมอ (หมดเวลาแล้วกลับโหมดปกติ; ถ้าจะต่อเวลาให้สั่งใหม่)
