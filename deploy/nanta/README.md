# Nanta Hybrid Deployment

โหมด Hybrid:
- Jin รันบน host ตามเดิม
- Nanta รันใน Docker แยก environment

## 1) เตรียมไฟล์ env

```bash
cd deploy/nanta
cp .env.nanta.example .env.nanta
# แก้ค่าใน .env.nanta ตามต้องการ
```

## 2) รัน Nanta container

```bash
docker compose -f docker-compose.nanta.yml up -d
```

## 3) ตรวจสถานะ

```bash
docker compose -f docker-compose.nanta.yml ps
docker compose -f docker-compose.nanta.yml logs -f
```

## 4) หยุด/เริ่มใหม่

```bash
docker compose -f docker-compose.nanta.yml down
docker compose -f docker-compose.nanta.yml up -d
```

## Notes
- ไฟล์นี้เน้นแยก runtime ของ Nanta ก่อน (Phase Hybrid)
- orchestration ยังควบคุมจาก Jin/orchestrator ฝั่ง host
- ขั้นต่อไปค่อยต่อ worker logic ให้ Nanta execute jobs โดยตรง
