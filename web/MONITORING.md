# Web MVP Monitoring

## Goal
ดูว่าเว็บยังเข้าถึงได้และดึงสถานะ issue พื้นฐานได้ตามปกติ

## Local run
```bash
npm run monitor:web
```

ผลลัพธ์:
- พิมพ์ summary ลง stdout
- เขียนไฟล์ `web/monitor-latest.md`

## CI run
Workflow: `.github/workflows/web-mvp-monitor.yml`
- รันทุก 30 นาที
- เก็บ artifact `web-monitor-report`

## Signals
- Site health (HTTP + marker check)
- Issue API probes (#1, #3) latency/status

## Next phase
- เพิ่ม alert routing (เช่น Telegram) เมื่อ fail ต่อเนื่องหลายรอบ
- ติดตาม fallback hit-rate จาก frontend telemetry
