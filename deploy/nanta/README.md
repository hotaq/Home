# Nanta Hybrid Deployment

โหมด Hybrid:
- Jin รันบน host ตามเดิม
- Nanta รันใน Docker แยก environment

## 1) เตรียมไฟล์ env

```bash
cd /home/shoji/.openclaw/workspace/deploy/nanta
cp .env.nanta.example .env.nanta
# ใส่ GITHUB_TOKEN, REPO_OWNER, REPO_NAME
```

## 2) รัน Nanta worker

```bash
sudo docker compose -f docker-compose.nanta.yml up -d
```

## 3) ตรวจสถานะ

```bash
sudo docker compose -f docker-compose.nanta.yml ps
sudo docker compose -f docker-compose.nanta.yml logs -f
```

ถ้าเห็นบรรทัด `started for <owner>/<repo>` แปลว่าพร้อมทำงาน

## 4) ทดสอบ
ไปที่ issue ใดก็ได้ใน repo แล้วลองคอมเมนต์:

- `/summon nanta-zealot`
- `/ritual ทดสอบ Nanta docker worker`

Nanta จะตอบกลับพร้อม footer `actor: nanta-zealot`.

## Notes
- Worker นี้ polling GitHub comments ทุก 30 วินาที
- มี dedupe state ที่ `/state/nanta-worker-state.json`
- orchestration หลักยังอยู่กับ Jin/orchestrator ฝั่ง host
