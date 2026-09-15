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
2. **Magic Link Auth** — có back navigation, loading state, callback error state và exact production callback URL.
3. **Profile + Avatar Upload** — user tải ảnh; ảnh được crop/nén WebP 512×512 trước khi upload.
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

## Magic Link production flow

Frontend gửi Magic Link với callback chính xác:

`https://derekdaydoi.github.io/Together/`

Khi user quay lại từ email, app:

1. kiểm tra session hiện tại;
2. để `supabase-js` consume token trong URL;
3. hiển thị lỗi callback thay vì blank/dead-end;
4. bootstrap/load profile;
5. nếu đã có couple → vào `Today`;
6. nếu chưa có couple → đi `Profile → Connect`.

Magic Link là one-time link. Nếu link đã được mở/scanned trước hoặc hết hạn, app yêu cầu gửi link mới thay vì để user mắc kẹt.

### URL Configuration bắt buộc trên Supabase hosted project

Supabase → **Authentication → URL Configuration**:

- Site URL: `https://derekdaydoi.github.io/Together/`
- Additional Redirect URL: `https://derekdaydoi.github.io/Together/`

Đây là account-level Auth setting; source code không thể tự thay thế allow-list của Supabase.

## Chạy local

```bash
npm install
npm run dev
```

Không cấu hình Supabase thì app chạy **Demo Mode** bằng localStorage để review toàn bộ UX ngay lập tức.

### Kết nối Supabase

Copy `.env.example` thành `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Sau đó apply `supabase/schema.sql` + migrations, deploy Edge Function `join-couple`, rồi chạy lại app.

## Deploy

Workflow `.github/workflows/deploy-pages.yml` typecheck, build Vite production, publish compiled assets và deploy GitHub Pages mỗi khi push `main`.

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

Supabase Security Advisor hiện chỉ cảnh báo **Leaked Password Protection Disabled**; Together đang dùng passwordless Magic Link nên cảnh báo này không chặn flow hiện tại. Performance Advisor chỉ báo index chưa được sử dụng do product tables mới gần như chưa có dữ liệu.
