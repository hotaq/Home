# Dual OpenClaw (Jin + Nanta)

โหมดนี้จะรัน OpenClaw 2 ตัวแยกกันชัดเจน:
- Jin: `:18789`
- Nanta: `:28789`

## 1) เตรียม env
```bash
cd /home/shoji/.openclaw/workspace/deploy/openclaw-dual
cp .env.jin.example .env.jin
cp .env.nanta.example .env.nanta
# แก้ token ทั้งสองไฟล์ให้ไม่ซ้ำกัน
```

## 2) ปิด Nanta worker เดิม (ถ้ามี)
```bash
cd /home/shoji/.openclaw/workspace/deploy/nanta
sudo docker compose -f docker-compose.nanta.yml down
```

## 3) รัน 2 OpenClaw
```bash
cd /home/shoji/.openclaw/workspace/deploy/openclaw-dual
sudo docker compose up -d
sudo docker compose ps
```

## 4) ตรวจ log
```bash
sudo docker compose logs -f openclaw-jin
sudo docker compose logs -f openclaw-nanta
```

## 5) เข้าแต่ละตัว
- Jin UI: `http://SERVER_IP:18789`
- Nanta UI: `http://SERVER_IP:28789`

> แนะนำให้เปิดผ่าน SSH tunnel และตั้ง firewall จำกัดพอร์ต
