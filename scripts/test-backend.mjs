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
async function denied(sql, code) {
  await assert.rejects(db.exec(sql), error => !code || error.code === code)
}
async function asUser(id) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false)`)
}
const A = '00000000-0000-0000-0000-000000000001'
const B = '00000000-0000-0000-0000-000000000002'
const C = '00000000-0000-0000-0000-000000000003'
const D = '00000000-0000-0000-0000-000000000004'
const X = '10000000-0000-0000-0000-000000000001'
const Y = '10000000-0000-0000-0000-000000000002'
const Z = '10000000-0000-0000-0000-000000000003'
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
    await db.exec(await readFile(resolve(root, 'supabase/migrations', file), 'utf8'))
  }
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}'),('${D}');
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
    await db.exec('reset role')
    await denied(`insert into public.couple_members(couple_id,user_id) values ('${X}','${C}')`)
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
  console.log(`${passed} passed; ${failed} failed${baseline ? ' (baseline)' : ''}`)
  process.exitCode = failed ? 1 : 0
} finally { await db.close() }
