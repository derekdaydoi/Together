// Local PostgreSQL execution using PGlite; never connects to Supabase.
// Install @electric-sql/pglite@0.3.14 in a scratch directory, then pass its
// dist/index.js absolute path as PGLITE_MODULE. No production dependencies change.
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const { PGlite } = process.env.PGLITE_MODULE
  ? await import(pathToFileURL(resolve(process.env.PGLITE_MODULE)).href)
  : await import('@electric-sql/pglite')
const db = new PGlite()
const baseline = process.argv.includes('--baseline')
const beforeRevision = process.argv.includes('--before-revision')
let passed = 0, failed = 0
async function test(name, run) {
  try { await run(); passed++; console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`) }
}
async function denied(sql, code, params) {
  await assert.rejects(params ? db.query(sql, params) : db.exec(sql), error => !code || error.code === code)
}
async function asUser(id) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false)`)
}
const E = '00000000-0000-0000-0000-000000000005'
const F = '00000000-0000-0000-0000-000000000006'
const G = '00000000-0000-0000-0000-000000000007'
const I = '00000000-0000-0000-0000-000000000009'
const J = '00000000-0000-0000-0000-000000000010'
const K = '00000000-0000-0000-0000-000000000011'
const L = '00000000-0000-0000-0000-000000000012'
const A = '00000000-0000-0000-0000-000000000001'
const B = '00000000-0000-0000-0000-000000000002'
const C = '00000000-0000-0000-0000-000000000003'
const D = '00000000-0000-0000-0000-000000000004'
const X = '10000000-0000-0000-0000-000000000001'
const Y = '10000000-0000-0000-0000-000000000002'
const Z = '10000000-0000-0000-0000-000000000003'
const FULL_COUPLE = '10000000-0000-0000-0000-000000000004'
const PAIRED_LEGACY_OWNER = '00000000-0000-0000-0000-000000000090'
const PAIRED_LEGACY_PARTNER = '00000000-0000-0000-0000-000000000091'
const PAIRED_LEGACY_COUPLE = '10000000-0000-0000-0000-000000000095'
const inviteMigrationFile = '20260929023000_secure_one_time_couple_invites.sql'
const P = '20000000-0000-0000-0000-000000000001'
const legacyPlanId = '20000000-0000-0000-0000-000000000096'
const plan = `insert into public.plans(id,couple_id,created_by,title,starts_at,ends_at,plan_type,status)
  values ('${P}','${X}','${A}','Original','2026-09-28 12:00Z','2026-09-28 13:00Z','hard','proposed')`
try {
  // Model Supabase's roles/auth/storage contracts. PGlite cannot host its services.
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create publication supabase_realtime;
    -- Only pgcrypto randomness is stubbed: security/authorization SQL is unchanged.
    create function public.gen_random_bytes(integer) returns bytea language sql volatile as
      $$ select decode(replace(gen_random_uuid()::text,'-',''),'hex') $$;
    create schema if not exists extensions;
    create function extensions.gen_random_bytes(integer) returns bytea language sql volatile as
      $$ select decode(replace(gen_random_uuid()::text,'-',''),'hex') $$;
    grant usage on schema extensions to public;
    grant execute on function extensions.gen_random_bytes(integer) to public;
  `)
  const schema = await readFile(resolve(root, 'supabase/schema.sql'), 'utf8')
  await db.exec(schema.replace('create extension if not exists pgcrypto;', ''))
  const migrations = (await readdir(resolve(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort()
  for (const file of migrations) {
    if (baseline && file > '20260928104728_defer_hard_plan_guard_until_frontend_release.sql') continue
    if (beforeRevision && file.endsWith('_add_plan_revision.sql')) continue
    if (file.endsWith('_add_plan_revision.sql')) {
      // Exercise an actual upgrade with an existing legacy confirmed hard plan.
      await db.exec(`insert into auth.users(id) values ('00000000-0000-0000-0000-000000000096');
        insert into public.couples(id,created_by) values
          ('10000000-0000-0000-0000-000000000096','00000000-0000-0000-0000-000000000096');
        insert into public.plans(id,couple_id,created_by,title,starts_at,ends_at,plan_type,status) values
          ('${legacyPlanId}','10000000-0000-0000-0000-000000000096','00000000-0000-0000-0000-000000000096',
          'Before revision rollout','2026-09-28 12:00Z','2026-09-28 13:00Z','hard','confirmed');`)
    }
    if (file === inviteMigrationFile && !baseline) {
      // Seed a genuinely pre-migration, already-paired couple so the invite
      // migration's backfill is exercised instead of only its new-row defaults.
      await db.exec(`insert into auth.users(id) values ('${PAIRED_LEGACY_OWNER}'),('${PAIRED_LEGACY_PARTNER}');
        insert into public.couples(id,created_by) values ('${PAIRED_LEGACY_COUPLE}','${PAIRED_LEGACY_OWNER}');
        insert into public.couple_members(couple_id,user_id,role)
          values ('${PAIRED_LEGACY_COUPLE}','${PAIRED_LEGACY_PARTNER}','member');`)
    }
    await db.exec(await readFile(resolve(root, 'supabase/migrations', file), 'utf8'))
  }
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}'),('${D}'),('${E}'),('${F}'),('${G}'),('${I}');
    insert into public.couples(id,created_by) values ('${X}','${A}'),('${Y}','${C}');
    insert into public.couple_members(couple_id,user_id) values ('${X}','${B}');`)

  await test('long auth metadata cannot break signup through the profile trigger', async () => {
    await db.exec(`insert into auth.users(id,raw_user_meta_data) values
      ('00000000-0000-0000-0000-000000000098',jsonb_build_object('display_name',repeat('x',61)))`)
    const result = await db.query(`select display_name from public.profiles where id='00000000-0000-0000-0000-000000000098'`)
    assert.equal(result.rows[0].display_name, 'x'.repeat(60))
  })
  await test('blank auth display name falls back to a usable profile name', async () => {
    await db.exec(`insert into auth.users(id,raw_user_meta_data) values
      ('00000000-0000-0000-0000-000000000097','{"display_name":"   "}')`)
    const result = await db.query(`select display_name from public.profiles where id='00000000-0000-0000-0000-000000000097'`)
    assert.equal(result.rows[0].display_name, 'Bạn')
  })

  await test('owner can create a couple with INSERT RETURNING (PostgREST representation)', async () => {
    await asUser(D)
    const result = await db.query(`insert into public.couples(id,created_by) values ('${Z}','${D}') returning id`)
    assert.equal(result.rows[0].id, Z)
  })
  if (!baseline && migrations.includes(inviteMigrationFile)) {
    await test('invite migration backfills existing paired couples as consumed with an expiry', async () => {
      await db.exec('reset role')
      const result = await db.query(`select invite_expires_at is not null as has_expiry,
        invite_used_at is not null as consumed from public.couples where id='${PAIRED_LEGACY_COUPLE}'`)
      assert.deepEqual(result.rows, [{ has_expiry: true, consumed: true }])
    })
  }
  if (!baseline) {
    let inviteCode
    let inviteConsumedAt
    await test('owner can rotate a high-entropy invitation under authenticated SQL role', async () => {
      await asUser(D)
      const result = await db.query('select * from public.rotate_couple_invite()')
      assert.equal(result.rows.length, 1)
      inviteCode = result.rows[0].invite_code
      assert.match(inviteCode, /^[A-F0-9]{32}$/)
      assert.ok(new Date(result.rows[0].invite_expires_at).getTime() > Date.now())
    })
    await test('prospective authenticated member can redeem an unexpired invitation once', async () => {
      await asUser(E)
      const result = await db.query('select public.redeem_couple_invite($1) as couple_id', [inviteCode])
      assert.deepEqual(result.rows, [{ couple_id: Z }])
      assert.deepEqual((await db.query(`select role from public.couple_members where couple_id='${Z}' and user_id='${E}'`)).rows,
        [{ role: 'member' }])
      const consumed = await db.query(`select invite_used_at
        from public.couples where id='${Z}'`)
      inviteConsumedAt = consumed.rows[0].invite_used_at
      assert.ok(inviteConsumedAt)
    })
    await test('consumed invitation cannot be redeemed by a second authenticated user', async () => {
      // Removing the invitee must not reopen a token that has been consumed.
      await db.exec(`reset role; delete from public.couple_members
        where couple_id='${Z}' and user_id='${E}'`)
      assert.equal((await db.query(`select count(*)::int as members from public.couple_members where couple_id='${Z}'`)).rows[0].members, 1)
      const usedAtAfterRemoval = (await db.query(`select invite_used_at from public.couples where id='${Z}'`)).rows[0].invite_used_at
      assert.equal(new Date(usedAtAfterRemoval).getTime(), new Date(inviteConsumedAt).getTime())
      await asUser(F)
      await denied('select public.redeem_couple_invite($1)', '22023', [inviteCode])
      assert.equal((await db.query(`select 1 from public.couple_members where user_id='${F}'`)).rows.length, 0)
    })
    await test('rotating an invitation invalidates its previous code', async () => {
      await asUser(C)
      const previous = (await db.query('select * from public.rotate_couple_invite()')).rows[0].invite_code
      const current = (await db.query('select * from public.rotate_couple_invite()')).rows[0].invite_code
      assert.notEqual(current, previous)
      await asUser(G)
      await denied('select public.redeem_couple_invite($1)', '22023', [previous])
      assert.equal((await db.query(`select 1 from public.couple_members where user_id='${G}'`)).rows.length, 0)
    })
    await test('expired invitation is rejected for an authenticated prospective member', async () => {
      await asUser(C)
      const rotated = await db.query('select * from public.rotate_couple_invite()')
      const expiredCode = rotated.rows[0].invite_code
      await db.exec(`reset role; update public.couples set invite_expires_at=now()-interval '1 second' where id='${Y}'`)
      await asUser(G)
      await denied('select public.redeem_couple_invite($1)', '22023', [expiredCode])
      assert.equal((await db.query(`select 1 from public.couple_members where user_id='${G}'`)).rows.length, 0)
    })
    await test('only the owner may rotate an invitation', async () => {
      await asUser(B)
      await denied('select * from public.rotate_couple_invite()', '42501')
    })
    await test('redeem rejects a third member of an independent full-couple fixture', async () => {
      // Keep this full couple separate from Z, whose invitee is removed in the
      // consumed-token test above.
      await db.exec(`reset role;
        insert into auth.users(id) values ('${J}'),('${K}'),('${L}');
        insert into public.couples(id,created_by) values ('${FULL_COUPLE}','${J}');
        insert into public.couple_members(couple_id,user_id,role)
          values ('${FULL_COUPLE}','${K}','member');`)
      const fullCoupleCode = (await db.query(`select invite_code from public.couples where id='${FULL_COUPLE}'`)).rows[0].invite_code
      await asUser(L)
      await denied('select public.redeem_couple_invite($1)', '22023', [fullCoupleCode])
      assert.equal((await db.query(`select 1 from public.couple_members where user_id='${L}'`)).rows.length, 0)
    })
  }
  await test('outsider cannot read another couple or its membership', async () => {
    await asUser(C)
    assert.equal((await db.query(`select id from public.couples where id='${X}'`)).rows.length, 0)
    assert.equal((await db.query(`select user_id from public.couple_members where couple_id='${X}'`)).rows.length, 0)
  })
  await test('browser cannot self-enroll or alter membership/owner', async () => {
    await asUser(C)
    await denied(`insert into public.couple_members(couple_id,user_id) values ('${X}','${C}')`, '42501')
    await asUser(B)
    await denied(`update public.couples set created_by='${B}' where id='${X}'`, '42501')
  })
  await test('existing member cannot create a second couple', async () => {
    await asUser(A)
    await denied(`insert into public.couples(created_by) values ('${A}') returning id`)
  })
  await test('outsider cannot insert private state into another couple', async () => {
    await asUser(C)
    await denied(`insert into public.daily_states(couple_id,user_id,state_date,energy_level,closeness_need)
      values ('${X}','${C}','2026-09-28',3,3)`, '42501')
  })
  await test('anonymous clients have no product table access', async () => {
    await db.exec('reset role; set role anon')
    await denied('select * from public.couples', '42501')
    await denied('select * from public.plans', '42501')
  })
  await test('third membership rejected even for privileged join service', async () => {
    await asUser(I)
    await denied(`insert into public.couple_members(couple_id,user_id) values ('${X}','${I}')`, '42501')
    await db.exec('reset role')
    await denied(`insert into public.couple_members(couple_id,user_id) values ('${X}','${I}')`, 'P0001')
  })
  await test('users cannot forge partner state or change its ownership', async () => {
    await asUser(A)
    await denied(`insert into public.daily_states(couple_id,user_id,state_date,energy_level,closeness_need)
      values ('${X}','${B}','2026-09-28',3,3)`, '42501')
    await db.exec(`insert into public.daily_states(couple_id,user_id,state_date,energy_level,closeness_need)
      values ('${X}','${A}','2026-09-28',3,3)`)
    await denied(`update public.daily_states set user_id='${B}' where couple_id='${X}'`, '42501')
  })
  await test('check-ins stay private until both submit; outsider stays excluded', async () => {
    await asUser(A)
    await db.exec(`insert into public.weekly_checkins(couple_id,user_id,week_start,feeling) values ('${X}','${A}','2026-09-28',2)`)
    await asUser(B)
    assert.equal((await db.query('select * from public.weekly_checkins')).rows.length, 0)
    await db.exec(`insert into public.weekly_checkins(couple_id,user_id,week_start,feeling) values ('${X}','${B}','2026-09-28',2)`)
    assert.equal((await db.query('select * from public.weekly_checkins')).rows.length, 2)
    await asUser(C)
    assert.equal((await db.query('select * from public.weekly_checkins')).rows.length, 0)
  })
  await test('compatibility migration leaves hard-plan guard inactive before release', async () => {
    await db.exec('reset role')
    assert.equal((await db.query(`select * from pg_trigger where tgname='plans_guard_hard_confirmation'`)).rows.length, 0)
  })
  if (!baseline) {
    await test('migration initializes existing plans at revision 1 without changing status', async () => {
      await db.exec('reset role')
      const result = await db.query(`select title,status,revision from public.plans where id='${legacyPlanId}'`)
      assert.deepEqual(result.rows, [{title:'Before revision rollout',status:'confirmed',revision:1}])
    })
    await test('revision trigger is active before the hard-plan guard rollout', async () => {
      await db.exec('reset role')
      const result = await db.query(`select tgenabled from pg_trigger where tgname='plans_set_revision' and tgrelid='public.plans'::regclass`)
      assert.deepEqual(result.rows, [{tgenabled:'O'}])
      await asUser(A)
      const row = await db.query(`insert into public.plans(couple_id,created_by,title,starts_at,ends_at,plan_type,status)
        values ('${X}','${A}','Legacy client','2026-09-28 12:00Z','2026-09-28 13:00Z','hard','confirmed') returning id,revision`)
      assert.equal(row.rows[0].revision, 1)
      await db.exec(`delete from public.plans where id='${row.rows[0].id}'`)
    })
  }
  await db.exec('reset role')
  const activation = await readFile(resolve(root, 'supabase/post-release/activate_hard_plan_guard.sql'), 'utf8')
  await test('post-release script creates the missing trigger and is safe to rerun', async () => {
    await db.exec(activation)
    await db.exec(activation)
    const result = await db.query(`select tgenabled from pg_trigger where tgname='plans_guard_hard_confirmation'`)
    assert.deepEqual(result.rows, [{tgenabled:'O'}])
  })
  await test('post-release script re-enables an existing disabled trigger', async () => {
    await db.exec('alter table public.plans disable trigger plans_guard_hard_confirmation')
    await db.exec(activation)
    const result = await db.query(`select tgenabled from pg_trigger where tgname='plans_guard_hard_confirmation'`)
    assert.deepEqual(result.rows, [{tgenabled:'O'}])
  })
  await test('hard plans cannot start confirmed', async () => {
    await asUser(A)
    await denied(plan.replace("'hard','proposed'", "'hard','confirmed'"))
  })
  await asUser(A)
  await db.exec(plan)
  await test('proposer cannot confirm; outsider cannot see or accept', async () => {
    await denied(`update public.plans set status='confirmed' where id='${P}'`)
    await asUser(C)
    assert.equal((await db.query(`update public.plans set status='confirmed' where id='${P}' returning id`)).rows.length, 0)
  })
  await test('partner cannot rewrite the proposal while confirming', async () => {
    await asUser(B)
    await denied(`update public.plans set title='Changed',status='confirmed' where id='${P}'`)
  })
  await test('partner can confirm the original proposal', async () => {
    await asUser(B)
    await db.exec(`update public.plans set status='confirmed' where id='${P}'`)
  })
  await test('partner cannot regress a confirmed hard plan to a new proposal', async () => {
    await asUser(B)
    await denied(`update public.plans set status='proposed' where id='${P}'`)
  })
  // Restore the state for following cases when running against the old guard.
  await asUser(B)
  await db.exec(`update public.plans set status='confirmed' where id='${P}'`)
  await test('confirmed edits require a fresh pending proposal', async () => {
    await asUser(A)
    await denied(`update public.plans set title='Changed' where id='${P}'`)
    await db.exec(`update public.plans set title='Changed',status='proposed' where id='${P}'`)
  })
  await test('hard-soft-hard conversion cannot bypass partner acceptance', async () => {
    await asUser(A)
    await db.exec(`update public.plans set plan_type='soft',status='confirmed' where id='${P}'`)
    await denied(`update public.plans set plan_type='hard' where id='${P}'`)
    await db.exec(`update public.plans set plan_type='hard',status='proposed' where id='${P}'`)
  })
  await test('partner cannot rewrite a soft plan as a hard proposal then accept it', async () => {
    await asUser(A)
    await db.exec(`update public.plans set plan_type='soft',status='proposed' where id='${P}'`)
    await asUser(B)
    await denied(`update public.plans set plan_type='hard',title='Partner invented this' where id='${P}'`)
  })
  await asUser(A)
  await db.exec(`update public.plans set plan_type='hard',status='proposed' where id='${P}'`)
  await test('partner cannot reopen a cancelled proposal on behalf of its author', async () => {
    await asUser(A)
    await db.exec(`update public.plans set status='cancelled' where id='${P}'`)
    await asUser(B)
    await denied(`update public.plans set status='proposed' where id='${P}'`)
    await denied(`update public.plans set status='confirmed' where id='${P}'`)
  })
  await test('proposer can reopen and partner can reconfirm', async () => {
    await asUser(A)
    await db.exec(`update public.plans set status='proposed' where id='${P}'`)
    await asUser(B)
    await db.exec(`update public.plans set status='confirmed' where id='${P}'`)
  })
  await test('partner can still cancel to withdraw agreement', async () => {
    await asUser(B)
    await db.exec(`update public.plans set status='cancelled' where id='${P}'`)
    assert.equal((await db.query(`select status from public.plans where id='${P}'`)).rows[0].status, 'cancelled')
  })
  await test('partner cannot reassign or delete authorship', async () => {
    await asUser(B)
    await denied(`update public.plans set created_by='${B}' where id='${P}'`, '42501')
    assert.equal((await db.query(`delete from public.plans where id='${P}' returning id`)).rows.length, 0)
  })
  await test('all six shared tables are published, including couple_members', async () => {
    await db.exec('reset role')
    const result = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)
    assert.deepEqual(result.rows.map(r => r.tablename).sort(), ['availability_blocks','couple_members','daily_states','plans','weekly_checkins','work_schedules'])
  })
  if (!baseline) {
    await test('schedule DELETE filters have FULL replica identity with RLS and publication preserved', async () => {
      await db.exec('reset role')
      const result = await db.query(`
        select c.relname, c.relreplident, c.relrowsecurity,
          exists (
            select 1 from pg_publication_tables p
            where p.pubname='supabase_realtime'
              and p.schemaname=n.nspname and p.tablename=c.relname
          ) as published
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ('work_schedules','availability_blocks')
        order by c.relname`)
      assert.deepEqual(result.rows, [
        {relname:'availability_blocks',relreplident:'f',relrowsecurity:true,published:true},
        {relname:'work_schedules',relreplident:'f',relrowsecurity:true,published:true},
      ])
    })
    const R = '20000000-0000-0000-0000-000000000002'
    await asUser(A)
    await db.exec(plan.replace(P, R))
    await test('new plans start at server-managed revision 1', async () => {
      assert.equal((await db.query(`select revision from public.plans where id='${R}'`)).rows[0].revision, 1)
    })
    await test('direct edits increment revision even without an optimistic filter', async () => {
      await asUser(A)
      const result = await db.query(`update public.plans set title='Revised proposal' where id='${R}' returning revision`)
      assert.equal(result.rows[0].revision, 2)
    })
    await test('stale partner confirmation returns zero rows and leaves proposal pending', async () => {
      await asUser(B)
      const result = await db.query(`update public.plans set status='confirmed'
        where id='${R}' and couple_id='${X}' and revision=1 and status='proposed'
          and plan_type='hard' and created_by<>'${B}' returning id,revision`)
      assert.equal(result.rows.length, 0)
      assert.deepEqual((await db.query(`select status,revision from public.plans where id='${R}'`)).rows,
        [{status:'proposed',revision:2}])
    })
    await test('stale author edit returns zero rows without overwriting newer content', async () => {
      await asUser(A)
      const result = await db.query(`update public.plans set title='Stale content'
        where id='${R}' and revision=1 returning id`)
      assert.equal(result.rows.length, 0)
      assert.deepEqual((await db.query(`select title,revision from public.plans where id='${R}'`)).rows,
        [{title:'Revised proposal',revision:2}])
    })
    await test('fresh partner confirmation succeeds and increments revision', async () => {
      await asUser(B)
      const result = await db.query(`update public.plans set status='confirmed'
        where id='${R}' and revision=2 and status='proposed' returning status,revision`)
      assert.deepEqual(result.rows, [{status:'confirmed',revision:3}])
    })
    await test('no-op and cancellation updates both invalidate old revisions', async () => {
      await asUser(B)
      assert.equal((await db.query(`update public.plans set status=status where id='${R}' returning revision`)).rows[0].revision, 4)
      assert.equal((await db.query(`update public.plans set status='cancelled' where id='${R}' returning revision`)).rows[0].revision, 5)
    })
    await test('authenticated clients cannot assign revision directly', async () => {
      await asUser(A)
      await denied(`update public.plans set revision=1 where id='${R}'`, '42501')
      assert.equal((await db.query(`select revision from public.plans where id='${R}'`)).rows[0].revision, 5)
    })
    await test('supplied INSERT revisions are replaced with 1', async () => {
      await asUser(A)
      const result = await db.query(`insert into public.plans(couple_id,created_by,title,starts_at,ends_at,revision)
        values ('${X}','${A}','Forged version','2026-09-28 12:00Z','2026-09-28 13:00Z',2147483647) returning revision`)
      assert.equal(result.rows[0].revision, 1)
    })
    await test('trigger overrides forged revisions even with broader UPDATE privileges', async () => {
      await db.exec('reset role')
      const result = await db.query(`update public.plans set revision=1 where id='${R}' returning revision`)
      assert.equal(result.rows[0].revision, 6)
    })
  }
  if (!baseline && migrations.includes('20261005120000_delete_couple_data.sql')) {
    const U1 = '00000000-0000-0000-0000-0000000000a1'
    const U2 = '00000000-0000-0000-0000-0000000000a2'
    const U3 = '00000000-0000-0000-0000-0000000000a3'
    const U4 = '00000000-0000-0000-0000-0000000000a4'
    const W = '10000000-0000-0000-0000-0000000000a1'
    const V = '10000000-0000-0000-0000-0000000000a2'
    const childTables = ['couple_members', 'daily_states', 'work_schedules', 'availability_blocks', 'plans', 'weekly_checkins']
    const countFor = async (couple) => {
      await db.exec('reset role')
      const out = {}
      for (const t of childTables) out[t] = Number((await db.query(`select count(*) as n from public.${t} where couple_id='${couple}'`)).rows[0].n)
      out.couples = Number((await db.query(`select count(*) as n from public.couples where id='${couple}'`)).rows[0].n)
      return out
    }
    await db.exec(`reset role;
      insert into auth.users(id) values ('${U1}'),('${U2}'),('${U3}'),('${U4}');
      insert into public.couples(id,created_by) values ('${W}','${U1}'),('${V}','${U3}');
      insert into public.couple_members(couple_id,user_id) values ('${W}','${U2}'),('${V}','${U4}');
      insert into public.daily_states(couple_id,user_id,state_date,energy_level,closeness_need) values ('${W}','${U1}','2026-10-05',3,3),('${W}','${U2}','2026-10-05',2,4);
      insert into public.work_schedules(couple_id,user_id,starts_at,ends_at,work_type) values ('${W}','${U2}','2026-10-05 02:00Z','2026-10-05 10:00Z','office');
      insert into public.availability_blocks(couple_id,user_id,starts_at,ends_at,status) values ('${W}','${U1}','2026-10-05 12:00Z','2026-10-05 14:00Z','available');
      insert into public.plans(couple_id,created_by,title,starts_at,ends_at) values ('${W}','${U1}','Mine','2026-10-05 12:00Z','2026-10-05 13:00Z'),('${W}','${U2}','Partner plan','2026-10-05 14:00Z','2026-10-05 15:00Z'),('${V}','${U3}','Other couple','2026-10-05 12:00Z','2026-10-05 13:00Z');
      insert into public.weekly_checkins(couple_id,user_id,week_start,feeling) values ('${W}','${U1}','2026-10-05',2);`)
    await test('delete_couple_data: signed-out and anon callers are rejected', async () => {
      await db.exec('reset role; select set_config(\'request.jwt.claim.sub\', \'\', false); set role anon')
      await denied('select public.delete_couple_data()', '42501')
    })
    await test('delete_couple_data: a user without a couple is a harmless no-op', async () => {
      const lone = '00000000-0000-0000-0000-0000000000a5'
      await db.exec(`reset role; insert into auth.users(id) values ('${lone}')`)
      await asUser(lone)
      await db.exec('select public.delete_couple_data()')
    })
    await test('delete_couple_data: the non-owner partner can erase all of the couple\'s data', async () => {
      const before = await countFor(W)
      assert.ok(Object.values(before).every(n => n > 0), JSON.stringify(before))
      await asUser(U2)
      await db.exec('select public.delete_couple_data()')
      const after = await countFor(W)
      assert.ok(Object.values(after).every(n => n === 0), JSON.stringify(after))
    })
    await test('delete_couple_data: only the caller\'s couple is touched', async () => {
      const other = await countFor(V)
      assert.equal(other.couples, 1)
      assert.equal(other.plans, 1)
      assert.equal(other.couple_members, 2)
    })
    await test('delete_couple_data: both people keep their profiles and are free to join a new couple', async () => {
      await db.exec('reset role')
      const profiles = await db.query(`select count(*) as n from public.profiles where id in ('${U1}','${U2}')`)
      assert.equal(Number(profiles.rows[0].n), 2)
      const members = await db.query(`select count(*) as n from public.couple_members where user_id in ('${U1}','${U2}')`)
      assert.equal(Number(members.rows[0].n), 0)
      await asUser(U1)
      const created = await db.query(`insert into public.couples(created_by) values ('${U1}') returning id`)
      assert.ok(created.rows[0].id)
    })
    await test('delete_couple_data: calling it again after deletion is a no-op, and the owner can delete too', async () => {
      await asUser(U2)
      await db.exec('select public.delete_couple_data()')
      await asUser(U3)
      await db.exec('select public.delete_couple_data()')
      assert.equal((await countFor(V)).couples, 0)
    })
  }
  console.log(`${passed} passed; ${failed} failed${baseline ? ' (baseline)' : ''}`)
  process.exitCode = failed ? 1 : 0
} finally { await db.close() }
