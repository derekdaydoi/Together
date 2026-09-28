# Together · Relaunch QA

## Automated checks

Run `npm ci`, `npm run test:logic`, and `npm run build`. Pull requests run all three in GitHub Actions. These cover the date/overlap/energy logic and compile the complete app.

## Backend state after relaunch

- The existing Supabase project was resumed. Preserve its project reference and existing auth users.
- The database migration `20260928103516_realtime_couple_members` makes partner joins update the owner's screen.
- The migration `20260928103942_require_partner_plan_confirmation` defines the rule that the other member must confirm a hard plan. It has **not** been left active on the current production database because the current deployed web client still creates hard plans as confirmed.
- The compatibility migration `20260928104728_defer_hard_plan_guard_until_frontend_release` disables only this new trigger until the matching frontend goes live; the function definition remains intact.
- RLS remains enabled for all eight product tables. An existing password security advisor warning relates to password-based auth; Together currently uses Magic Links.

## Two-device acceptance test (required before production merge)

Use two different browser profiles/devices and two real email addresses. An automated build cannot prove these account-level flows work on the hosted Supabase project. **Deploy the updated web client first, then apply `supabase/post-release/activate_hard_plan_guard.sql`, and verify the trigger is enabled before running the hard-plan acceptance scenarios.**

1. Confirm **Authentication → URL Configuration** allows the exact `https://derekdaydoi.github.io/Together/` callback, open a *fresh* Magic Link on each device, and check errors/retry.
2. User A creates a couple, shares only the invite code with B. User B joins. Verify A's screen updates without refresh and a third user cannot join.
3. On both devices, add work dates and availability. Verify realtime updates; remove one availability block and one weekly work series; confirm the other screen updates.
4. Set overlapping availability but put work, a busy interval, or an alone interval inside it. Check the suggested time excludes the unavailable minutes. A slot under 45 minutes should produce no recommendation.
5. Set significantly different energy/closeness signals; confirm the advice respects the less energetic/less close partner, including the no-pressure wording.
6. Once the post-release guard is enabled, create a *hard* plan as A. It must remain pending. A cannot confirm it. B confirms via the plan detail. Then edit it as A: it must require B's confirmation again. Cancel and confirm the history filter.
7. Create a soft plan from a Week suggestion; verify selected day and times are filled automatically, edit it, then cancel it.
8. Both users submit the same week's check-in. Verify the partner's response is invisible before both submit and visible afterward.

## Product scope

This release addresses the real weekly scheduling loop and lightweight activity ideas. Restaurant catalogs, Google Calendar import, chat, and fully personalized recommendations are separate product bets. Never infer that a scheduled hard plan proves emotional agreement; the explicit partner confirmation models only the in-app planning decision.
