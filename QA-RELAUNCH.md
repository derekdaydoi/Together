# Together · Relaunch QA

## Automated checks

Run `npm ci`, `npm run test:logic`, `npm install --no-save --ignore-scripts --no-package-lock @electric-sql/pglite@0.3.14`, `node scripts/test-backend.mjs`, and `npm run build`. Both pull-request and production workflows run these checks. The local PostgreSQL tests exercise RLS, couple membership, hard-plan rules and stale-revision protection; they do not connect to production or replace two-device acceptance.

## Backend state after relaunch

- The existing Supabase project was resumed. Preserve its project reference and existing auth users.
- The database migration `20260928103516_realtime_couple_members` makes partner joins update the owner's screen.
- The migration `20260928103942_require_partner_plan_confirmation` defines the rule that the other member must confirm a hard plan. It has **not** been left active on the current production database because the current deployed web client still creates hard plans as confirmed.
- The compatibility migration `20260928104728_defer_hard_plan_guard_until_frontend_release` drops only this new trigger until the matching frontend goes live; the function definition remains intact.
- Apply `20260928112558_fix_couple_creation_and_plan_lifecycle` to repair new-couple creation, profile bootstrap and proposal transitions before deploying the updated client.
- Apply `20260928113328_add_plan_revision` before deploying the revision-aware client. Every successful plan update increments a server-managed revision. Editing, confirming and cancelling pass an expected revision and reject stale requests.
- Apply `20260928114344_enable_filtered_schedule_deletes` before testing realtime deletions. It supplies old `couple_id` to Supabase's filtered DELETE routing via `REPLICA IDENTITY FULL` without adding public data permissions. Database-level tests verify table configuration; end-to-end delivery requires a hosted two-device test. DELETE metadata visibility through Postgres Changes is a documented privacy tradeoff; see README.
- RLS remains enabled for all eight product tables. An existing password security advisor warning relates to password-based auth; Together currently uses Magic Links.

## Two-device acceptance test (required before production merge)

Use two different browser profiles/devices and two real email addresses. An automated build cannot prove these account-level flows work on the hosted Supabase project. **Deploy the updated web client first, then apply `supabase/post-release/activate_hard_plan_guard.sql`, and verify the trigger is enabled before running the hard-plan acceptance scenarios.**

1. Confirm **Authentication → URL Configuration** allows the exact `https://derekdaydoi.github.io/Together/` callback, open a *fresh* Magic Link on each device, and check errors/retry.
2. User A creates a couple, shares only the invite code with B. User B joins. Verify A's screen updates without refresh and a third user cannot join.
3. On both devices, add work dates and availability. Verify realtime updates; remove one availability block and one weekly work series; confirm the other screen updates. Repeat after taking B offline, editing on A and reconnecting B. Verify C, an unrelated signed-in user, cannot view either couple's schedule or notes through normal table reads.
4. Navigate to the previous and following weeks using the calendar arrows, then return using **Tuần này**. Set overlapping availability but put work, a busy interval, or an alone interval inside it. Check the suggested time excludes the unavailable minutes. A slot under 45 minutes should produce no recommendation.
5. Set significantly different energy/closeness signals; confirm the advice respects the less energetic/less close partner, including the no-pressure wording.
6. Once the post-release guard is enabled, create a *hard* plan as A. It must remain pending. A cannot confirm it. B confirms via the plan detail. Then edit it as A: it must require B's confirmation again. Open the old proposal on B, edit it on A and attempt to confirm without reviewing the new version on B: the stale request must fail. Review and confirm the fresh version; cancel and confirm the history filter. A stale cancel must fail if the plan changed in between.
7. Create a soft plan from a Week suggestion; verify selected day and times are filled automatically. Its timeslot must immediately be excluded from new recommendations even while its status is `proposed`. Edit it, then cancel it and verify the time becomes available again.
8. Both users submit the same week's check-in. Verify the partner's response is invisible before both submit and visible afterward.
9. In the same browser, sign out A and sign in B, including B without a couple. Before B's own state loads, no profile name, avatar, plan, invite code or check-in from A may appear. Confirm B's saved profile is loaded when B has no couple. Switch A → B while A's state refresh or profile save is pending; stale callbacks must not repopulate A's private state in B's session.
10. In B's plan details, deliberately delay the successful confirmation response while A cancels the same plan and B receives the newer cancelled revision through realtime. Releasing the stale confirmation response must leave the displayed status cancelled. Repeat with a delayed cancel and a newer rescheduled proposal, plus a delayed edit and a newer confirmation. Verify stale equal or older revisions cannot overwrite a newer snapshot, and a response must not resurrect a removed plan.

## Product scope

This release addresses the real weekly scheduling loop and lightweight activity ideas. Restaurant catalogs, Google Calendar import, chat, and fully personalized recommendations are separate product bets. Never infer that a scheduled hard plan proves emotional agreement; the explicit partner confirmation models only the in-app planning decision.
