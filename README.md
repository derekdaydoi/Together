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
2. **Profile + Avatar Upload** — user tải ảnh; ảnh được crop/nén WebP 512×512 trước khi upload.
3. **Create / Join Couple** — tạo không gian riêng hoặc tham gia qua mã mời.
4. **Today** — nhìn nhanh trạng thái hai người, workdate và recommendation trong ngày.
5. **Daily State** — energy 1–5 + closeness 1–5 + note.
6. **Workdate** — office / remote / shift / off / other, có repeat weekly.
7. **Availability** — available / busy / prefer alone / want together.
8. **Our Week** — calendar overlay của hai người + overlap suggestions.
9. **Plan Together** — `Soft Plan` hoặc `Hard Plan`.
10. **Plan Detail** — ngày, giờ, location, note, members.
11. **Weekly Check-in** — Too little / Just right / Too much; partner answer chỉ reveal khi cả hai đã hoàn thành.
12. **Us / Privacy** — avatar, daily state, check-in, invite code và privacy positioning.

## Design direction

UI bám theo mockup đã chốt và các nguyên tắc trong bài **“10 ChatGPT Prompts for Product Mockups That Convert”** của God of Prompt:

- product/screen luôn là focal point;
- nền ấm, ít distraction;
- shadow mềm, hierarchy rõ;
- visual phải giúp user “hình dung đang dùng app”, không chỉ đẹp;
- palette pastel nhưng action chính vẫn tương phản cao;
- mobile-first, device-like composition trên desktop;
- mỗi screen chỉ có một câu chuyện chính.

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

Schema đầy đủ ở `supabase/schema.sql`. Tất cả table trong `public` đều bật RLS. Partner không thể đọc data của couple khác chỉ bằng cách sửa request ở DevTools.

## Privacy model

- Không dùng `service_role` trong frontend.
- Avatar bucket là private.
- User chỉ upload vào folder của chính mình.
- Partner chỉ đọc avatar khi hai người share cùng couple.
- Work/availability/daily state chỉ readable bởi member của couple.
- Weekly check-in của partner chỉ reveal sau khi cả hai cùng submit.
- V1 hard-limit đúng **2 member/couple** ở database trigger, không chỉ ở UI.

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

Sau đó apply `supabase/schema.sql`, deploy Edge Function `join-couple`, rồi chạy lại app.

## Deploy

Workflow `.github/workflows/deploy-pages.yml` build và deploy lên GitHub Pages mỗi khi push `main`.

Supabase URL và publishable key là client-side config; workflow hiện đọc chúng từ GitHub Actions secrets nếu được cấu hình. Nếu chưa có, build vẫn chạy Demo Mode.

## Product boundaries — V1

**Có:** scheduling, energy, closeness, workdate, plan, weekly check-in, avatar, realtime.

**Chưa có:** relationship score, streak, diary, location tracking, chat, AI therapy, Google Calendar import.

Google Calendar nên là V1.5 sau khi core behavior chứng minh được giá trị.
