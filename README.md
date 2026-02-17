# UEH Smart Registration Portal

Ứng dụng fullstack Next.js cho cổng đăng ký học phần thông minh, có phòng chờ FIFO, SLA 48h và phân quyền Student/Admin.

## Stack
- Next.js App Router + TypeScript
- TailwindCSS + shadcn/ui + framer-motion
- Prisma + PostgreSQL (Neon/Supabase)
- Auth.js Credentials
- OTP email qua Nodemailer (local dùng MailHog)
- Zod validation
- Vitest (unit/integration) + Playwright (e2e)

## Nghiệp vụ chính
- Auth đầy đủ: login/logout, lock account 5 lần sai/15 phút, đổi mật khẩu, quên/đặt lại mật khẩu bằng OTP.
- Student:
  - Chỉ thấy học phần đúng **ngành/chương trình đào tạo** của mình.
  - Phân tách `Trong kế hoạch` / `Ngoài kế hoạch`.
  - Đăng ký trực tiếp, tham gia phòng chờ FIFO, xác nhận/từ chối offer, xem lịch sử và tài chính.
- Admin:
  - Tạo học phần theo **ngành/chương trình đào tạo** + `Trong kế hoạch/Ngoài kế hoạch`.
  - CRUD đào tạo + duyệt phòng chờ.
  - Rule `capacity_hidden` + guard API cập nhật sĩ số.

## Chuẩn bị `.env`
Sao chép:

```powershell
cp .env.example .env
```

Các biến bắt buộc:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_URL` (nên để `http://localhost:3000`)
- `NEXTAUTH_SECRET`
- `CRON_SECRET`
- `HISTORY_RETENTION_DAYS` (optional, default `2`)

## Chạy local (PowerShell Windows)

1. Cài dependencies:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
```

2. Parse dữ liệu Excel seed:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run seed:parse
```

3. Migrate + seed:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run prisma:deploy
& "C:\Program Files\nodejs\npm.cmd" run prisma:seed
```

4. Chạy app:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

## Tài khoản mặc định
- Admin: `admin@ueh.edu.vn / <SEED_DEFAULT_PASSWORD>`
- Student: `student1@ueh.edu.vn / <SEED_DEFAULT_PASSWORD>`
- Only for local/dev after seeding. Do not keep these accounts in production.

## Chạy test

```powershell
& "C:\Program Files\nodejs\npm.cmd" run lint
& "C:\Program Files\nodejs\npm.cmd" run typecheck
& "C:\Program Files\nodejs\npm.cmd" run test:unit
& "C:\Program Files\nodejs\npm.cmd" run test:integration
& "C:\Program Files\nodejs\npm.cmd" run test:e2e
```

`test:e2e` sẽ tự chạy `prisma:seed` trước khi mở Playwright để đảm bảo dữ liệu ổn định.

Nếu e2e báo thiếu browser:

```powershell
& "C:\Program Files\nodejs\npx.cmd" playwright install chromium
```

## Deploy Vercel + Neon
- Build command: `prisma migrate deploy && next build`
- Set env vars ở Vercel giống `.env`.
- Cron gọi:
  - `/api/jobs/sla-scan`
  - `/api/jobs/match-offers`
  - `/api/jobs/expire-offers`
  - `/api/jobs/cleanup-history`

## API response format

```json
{ "success": true, "data": {} }
```

hoặc

```json
{ "success": false, "error": { "code": "ERR", "message": "..." } }
```
