# Together

> **Hai cuộc sống khác nhau. Một nhịp chung.**

Together là một private web app/PWA cho hai người trong một mối quan hệ cùng nhìn thấy **workdate, availability, mức năng lượng và nhu cầu closeness**, sau đó biến những tín hiệu đó thành khoảng thời gian phù hợp để ở bên nhau.

## Câu chuyện sản phẩm

Calendar truyền thống trả lời: **“Khi nào tôi rảnh?”**  
Together trả lời: **“Khi nào hai người nên ở bên nhau, với mức năng lượng hiện tại và nhu cầu của cả hai?”**

Sản phẩm không chấm điểm relationship, không tạo streak, không ép hai người phải “gắn bó hơn”. Mục tiêu là giảm việc đoán ý nhau và giảm xung đột từ lịch sống khác nhau.

### Core loop

`Workdate → Energy/Closeness → Availability → Shared overlap → Soft/Hard plan → Weekly check-in`

## Full flow đã build

1. **Onboarding** — định vị sản phẩm bằng bốn trụ: workdate, energy, closeness, shared plans.
2. **Zero-email device identity** — mỗi thiết bị tự tạo một Supabase anonymous identity; không Gmail, mật khẩu hay Magic Link.
3. **Profile + Zodiac Avatar** — đặt tên và chọn một trong 12 con giáp Việt Nam; không dùng chữ cái đầu làm avatar mặc định.
4. **Create / Join Couple** — tạo không gian riêng hoặc tham gia qua mã mời.
5. **Today** — nhìn nhanh trạng thái hai người, workdate và recommendation trong ngày.
6. **Daily State** — energy 1–5 + closeness 1–5 + note.
7. **Workdate** — office / remote / shift / off / other, có repeat weekly.
8. **Availability** — available / busy / prefer alone / want together.
9. **Our Week** — calendar overlay của hai người + overlap suggestions.
10. **Plan Together** — `Soft Plan` hoặc `Hard Plan`.
11. **Plan Detail** — ngày, giờ, location, note, members.
12. **Weekly Check-in** — Too little / Just right / Too much; partner answer chỉ reveal khi cả hai đã hoàn thành.
13. **Us / Privacy** — avatar, daily state, check-in, invite code và privacy positioning.

## Design direction

UI bám theo mockup đã chốt và các nguyên tắc trong bài **“10 ChatGPT Prompts for Product Mockups That Convert”** của God of Prompt:

- product/screen luôn là focal point;
- nền ấm, ít distraction;
- shadow mềm, hierarchy rõ;
- visual phải giúp user hình dung đang dùng app, không chỉ đẹp;
- palette pastel nhưng action chính vẫn tương phản cao;
- mobile-first, device-like composition trên desktop;
- mỗi screen chỉ có một câu chuyện chính.

Typography production hiện dùng:

- **Cormorant Garamond**: chỉ dành cho wordmark `together.`;
- **Lora**: heading/editorial moments;
- **Be Vietnam Pro**: body, navigation, button, form và toàn bộ utility UI.

Cách tách này giữ được cảm giác intimate nhưng tránh app trông như wedding invitation hoặc một SaaS dashboard lạnh.

Signature `© 2026 hoangderek · Together` xuất hiện tinh tế ở entry flow và khu vực `Chúng mình`.

Reference: https://godofprompt.ai/blog/prompts-for-product-mockups/

## Architecture

```text
GitHub Pages / browser
        │
        ├── React + TypeScript + Vite
        ├── Local demo mode (khi chưa có Supabase env)
        │
        ▼
Supabase
        ├── Auth / Magic Link
        ├── Postgres
        ├── RLS
        ├── Realtime
        ├── Private Storage / avatars
        └── Edge Function / join-couple
```

### Database model

- `profiles`
- `couples`
- `couple_members`
- `daily_states`
- `work_schedules`
- `availability_blocks`
- `plans`
- `weekly_checkins`

Schema đầy đủ ở `supabase/schema.sql`. Production migrations bổ sung nằm trong `supabase/migrations/`.

Một trigger trên `auth.users` tự bootstrap `public.profiles`, nên user không còn phụ thuộc vào việc browser callback phải hoàn tất trước khi profile tồn tại. Existing Auth users cũng được backfill bằng migration.

## Privacy model

- Không dùng `service_role` trong frontend.
- Avatar bucket là private.
- User chỉ upload vào folder của chính mình.
- Partner chỉ đọc avatar khi hai người share cùng couple.
- Work/availability/daily state chỉ readable bởi member của couple.
- Weekly check-in của partner chỉ reveal sau khi cả hai cùng submit.
- V1 hard-limit đúng **2 member/couple** ở database trigger, không chỉ ở UI.

## Zero-email production flow

Frontend dùng Supabase Anonymous Auth. Khi user bấm **Bắt đầu**, app:

1. kiểm tra session đã lưu trên thiết bị;
2. nếu chưa có session, gọi anonymous sign-in để tạo identity riêng;
3. yêu cầu đặt tên + chọn avatar 12 con giáp;
4. nếu đã thuộc couple → vào Today;
5. nếu chưa có couple → đi tới Create / Join;
6. deep-link có `?invite=...` được redeem tự động sau khi profile hoàn tất.

### Cấu hình Supabase bắt buộc

Supabase → **Authentication → Providers → Anonymous** phải được bật. Workflow production kiểm tra setting này trước khi deploy để tránh phát hành frontend zero-email vào backend đang chặn anonymous signup.

Anonymous identity gắn với session lưu trên thiết bị. Clear site data, xóa PWA hoặc đổi thiết bị có thể làm mất identity ở V1; account recovery là scope riêng.

## Chạy local

```bash
npm install
npm run dev
```

Mặc định mở **http://localhost:3000/**. Trong môi trường dùng pnpm có thể chạy `pnpm dev`.
Vite sử dụng đường dẫn gốc `/` khi phát triển và `/Together/` khi build cho GitHub Pages;
không mở thư mục `dist/` trực tiếp dưới `localhost:3000` để thử bản phát triển.

Không cấu hình Supabase thì app chạy **Demo Mode** bằng localStorage để review toàn bộ UX ngay lập tức.

### Kết nối Supabase

Copy `.env.example` thành `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Sau đó apply `supabase/schema.sql` + migrations, deploy Edge Function `join-couple`, rồi chạy lại app.

Để test zero-email local với Supabase thật, tạo `.env.local` với **publishable** URL/key của project. Anonymous provider phải được bật trên cùng project. Không đưa secret/service-role key vào frontend.

## Deploy

Workflow `.github/workflows/deploy-pages.yml` typecheck, build Vite production, publish compiled assets và deploy GitHub Pages mỗi khi push `main`.

### Relaunch 2026-09-28: trình tự phát hành

Những thay đổi relaunch đang nằm trên nhánh phát triển; nội dung đang xuất hiện ở trang production có thể chưa bao gồm các sửa lỗi dưới đây. Để tránh làm hỏng ứng dụng cũ, thực hiện đúng trình tự:

1. Áp dụng các migration mới theo thứ tự timestamp trong `supabase/migrations/`. Migration sửa tạo couple và vòng đời kế hoạch, `plans.revision` và cấu hình realtime đều tương thích với client cũ. Giữ trigger bảo vệ hard plan **chưa bật** ở bước này.
2. Chạy các kiểm thử logic, PostgreSQL cục bộ và build production. Workflow pull request và workflow deploy đều kiểm tra cả ba.
3. Phát hành frontend mới từ `main` và xác minh phiên bản thực tế đã có luồng hard plan `proposed → confirmed` cùng xử lý xung đột revision.
4. Chỉ sau đó mới chạy `supabase/post-release/activate_hard_plan_guard.sql`; kiểm tra trigger `plans_guard_hard_confirmation` được bật, rồi chạy acceptance hai tài khoản/hai thiết bị theo `QA-RELAUNCH.md`.

Lưu ý: sửa đồng bộ khi xóa lịch dùng `REPLICA IDENTITY FULL`. Với Supabase Postgres Changes, RLS vẫn chỉ gửi khóa chính cho DELETE, nhưng một client được tùy biến có thể quan sát metadata xóa của các couple khác do DELETE không qua kiểm tra RLS từng hàng. Đây là giới hạn quyền riêng tư cần cân nhắc trước phát hành rộng; nếu phải bảo mật cả UUID/thời điểm xóa thì chuyển sự kiện bảng lịch sang private Realtime Broadcast và loại hai bảng này khỏi publication Postgres Changes.

Production hiện trỏ trực tiếp tới project Supabase `Together` qua `.env.production`. **Publishable key là public client key theo thiết kế của Supabase**; tuyệt đối không commit `service_role`.

Live app:

`https://derekdaydoi.github.io/Together/`

## Product boundaries — V1

**Có:** scheduling, energy, closeness, workdate, plan, weekly check-in, avatar, realtime.

**Chưa có:** relationship score, streak, diary, location tracking, chat, AI therapy, Google Calendar import.

Google Calendar nên là V1.5 sau khi core behavior chứng minh được giá trị.

## Production backend hiện tại

- Project: `Together`
- Region: Singapore (`ap-southeast-1`)
- Project ref: `jirbjekrevydrqytvfee`
- Edge Function: `join-couple` (JWT required)
- Storage: private bucket `avatars`, image-only, max 2 MB
- Auth profile bootstrap: trigger on `auth.users`
- Security: RLS trên toàn bộ public product tables

Supabase Security Advisor vẫn có cảnh báo **Leaked Password Protection Disabled**; Together V1 không dùng password login nên cảnh báo này không chặn zero-email flow hiện tại. Performance Advisor chỉ báo index chưa được sử dụng do product tables mới gần như chưa có dữ liệu.


## Google account recovery (opt-in, not a replacement for anonymous identity)

Existing users: open **Chúng mình → Bảo vệ tài khoản → Liên kết với Google**
on the device that holds the anonymous session *before* changing devices.
This uses `linkIdentity` on the current user; do not sign out or create a
new identity while linking. New device: select **Đăng nhập bằng Google**.
**Bắt đầu mới không cần Google** creates a different anonymous user ID,
which will not have access to the previous couple.

Manual authentication configuration (not applied by this PR):
1. In Google Cloud create a Web OAuth client and register the exact Supabase
   callback URL from the provider settings as an authorized redirect URI.
2. In Supabase Authentication enable Google provider with Client ID/Secret,
   enable Manual Linking, and allow
   `https://derekdaydoi.github.io/Together/` as an application redirect URL.
3. Test the flow end-to-end in Safari and on a physical iOS Home Screen PWA.
   Check that the existing user's UUID, couple membership, schedules,
   and weekly check-ins remain unchanged after linking and sign-in.
Never put OAuth Client Secret, DB URLs with passwords, or GPG passphrases in git.

## Backup (partial logical database export)

`.github/workflows/keepalive-backup.yml` runs a limited auth endpoint probe
and, if configured, creates a PostgreSQL 17 custom-format database dump,
checks its format, GPG-encrypts it, and uploads an artifact with a 30-day
retention period. Set GitHub Secrets `SUPABASE_DB_URL` (Supabase **Session
pooler** URI) and `BACKUP_PASSPHRASE`. The optional Actions *variable*
`SUPABASE_PUBLISHABLE_KEY` is used for the health check. Missing backup
secrets produce a warning and **skip** the backup; they do NOT count as a
successful backup. Verify artifacts after enabling it.

This is not full disaster recovery: Storage objects, all project configuration,
and selected ephemeral auth tables are absent. Practice restoring into an
isolated PostgreSQL environment with `gpg --decrypt`, `pg_restore --list`,
and a controlled test restore. Supabase Free-tier pausing depends on real
database activity; a successful HTTP health probe alone does NOT keep
the project from being paused. Monitor platform notifications.

Historical SQL migration `20261001075015` in this branch was already applied
to the Together production Supabase project; it is tracked here for consistency,
not to be run manually again. Do not change production without review.


### Google recovery release gate
The Google recovery UI is **opt-in and disabled by default** in this release:
`VITE_GOOGLE_RECOVERY_ENABLED=false` in the deployment workflow. This keeps
the current anonymous no-email onboarding usable while Google Cloud OAuth
Client ID/Secret are not configured. After the owner completes Google provider,
Manual Linking, redirect allowlist, and iOS PWA end-to-end testing, deliberately
set `VITE_GOOGLE_RECOVERY_ENABLED=true` in the deployment workflow and deploy
as a separate, reviewed change. Do not turn it on before credentials work.
