# UEH Smart Registration Portal

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-76E2B2?style=for-the-badge&logo=vitest&logoColor=6E6E6E)](https://vitest.dev/)

Hệ thống cổng thông tin Portal dành cho sinh viên Đại học Kinh tế TP. Hồ Chí Minh (UEH).

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
& "C:\Program Files\nodejs\npm.cmd" run validate:integrity
& "C:\Program Files\nodejs\npm.cmd" run test:unit
& "C:\Program Files\nodejs\npm.cmd" run test:integration
& "C:\Program Files\nodejs\npm.cmd" run test:e2e
```

`test:e2e` sẽ tự chạy `prisma:seed` trước khi mở Playwright để đảm bảo dữ liệu ổn định.

Dry-run integrity audit:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run repair:integrity
```

Apply auto-repair for fixable registration/finance drift:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run repair:integrity -- --apply
```

Nếu e2e báo thiếu browser:

```powershell
& "C:\Program Files\nodejs\npx.cmd" playwright install chromium
```
## Deploy Vercel + Neon

- Production release command: `npm run release:prod`
- Pre-release verification: `npm run release:verify`
- Keep generic `npm run build` non-mutating. If preview deployments share the same DB, do not attach `prisma migrate deploy` to every preview build.
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
