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
