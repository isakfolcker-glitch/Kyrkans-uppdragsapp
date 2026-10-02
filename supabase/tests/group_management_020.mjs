// Runs only in a disposable embedded PostgreSQL database with invented data.
// No connection to Supabase, no emails, no real accounts.
// npm install --prefix /tmp/group-sql --no-audit --no-fund @electric-sql/pglite
// PGLITE_MODULE_PATH=/tmp/group-sql node supabase/tests/group_management_020.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [process.env.PGLITE_MODULE_PATH ?? process.cwd()] }))
const db = new PGlite()
const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-0000-0000-00000000000${i + 1}`)
const [staffA, volunteerA, staffB, invited, inactive, kiosk] = ids
let passed = 0
const check = async (name, fn) => { await fn(); passed++; console.log(`OK ${name}`) }
const one = async sql => (await db.query(sql)).rows[0]
const save = (group, church, responsible, add = [], remove = [], create = false, label = 'Edited') => db.query(
  'SELECT public.save_group_management($1,$2,$3,$4,$5,$6::uuid[],$7::uuid[],$8)',
  [group, church, label, 'tag-extra', responsible, add, remove, create],
)

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.churches(id int PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE public.groups(id text PRIMARY KEY, label text NOT NULL, cls text NOT NULL DEFAULT 'tag-extra', church_id int REFERENCES public.churches(id) ON DELETE CASCADE);
    CREATE TABLE public.profile_churches(profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, church_id int REFERENCES public.churches(id) ON DELETE CASCADE,
      role text NOT NULL, is_employee boolean NOT NULL, active boolean NOT NULL DEFAULT true, accepted_at timestamptz, PRIMARY KEY(profile_id, church_id));
    CREATE TABLE public.profile_groups(profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, group_id text REFERENCES public.groups(id) ON DELETE CASCADE, PRIMARY KEY(profile_id, group_id));
    CREATE TABLE public.passes(id int PRIMARY KEY, church_id int REFERENCES public.churches(id));
    CREATE TABLE public.pass_groups(pass_id int REFERENCES public.passes(id), group_id text REFERENCES public.groups(id) ON DELETE CASCADE, PRIMARY KEY(pass_id, group_id));
    INSERT INTO public.churches VALUES(1),(2);
  `)
  for (const [index, id] of ids.entries()) await db.query('INSERT INTO public.profiles VALUES($1,$2)', [id, `Invented Person ${index}`])
  await db.query(`INSERT INTO public.profile_churches VALUES
    ($1,1,'anstalld',true,true,now()),($2,1,'ideell',false,true,now()),($3,2,'anstalld',true,true,now()),
    ($4,1,'anstalld',true,true,NULL),($5,1,'anstalld',true,false,now()),($6,1,'kiosk',false,true,now())`, ids)
  await db.exec("INSERT INTO public.groups VALUES('existing','Existing','tag-extra',1),('unrelated','Unrelated','tag-extra',2)")
  await db.exec("INSERT INTO public.groups VALUES('legacy','Legacy shared group','tag-kv',NULL); INSERT INTO public.passes VALUES(101,1),(102,2); INSERT INTO public.pass_groups VALUES(101,'legacy'),(102,'legacy')")
  await db.query("INSERT INTO public.profile_groups VALUES($1,'legacy'),($2,'legacy')", [volunteerA, staffB])
  const migration = await readFile(new URL('../migrations/020_grupphantering.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await check('migration is repeatable and preserves existing groups', async () => {
    await db.exec(migration)
    assert.equal((await one('SELECT count(*)::int AS count FROM public.groups')).count, 5)
  })
  await check('legacy shared groups get independent local copies with preserved member and pass links', async () => {
    const localA = await one("SELECT id,label,cls FROM public.groups WHERE source_group_id='legacy' AND church_id=1")
    const localB = await one("SELECT id FROM public.groups WHERE source_group_id='legacy' AND church_id=2")
    assert.notEqual(localA.id, localB.id)
    assert.equal(localA.label, 'Legacy shared group')
    assert.equal(localA.cls, 'tag-kv')
    assert.equal((await one(`SELECT count(*)::int AS count FROM public.profile_groups WHERE profile_id='${volunteerA}' AND group_id='${localA.id}'`)).count, 1)
    assert.equal((await one(`SELECT count(*)::int AS count FROM public.profile_groups WHERE profile_id='${volunteerA}' AND group_id='${localB.id}'`)).count, 0)
    assert.equal((await one(`SELECT group_id FROM public.pass_groups WHERE pass_id=101`)).group_id, localA.id)
    assert.equal((await one(`SELECT group_id FROM public.pass_groups WHERE pass_id=102`)).group_id, localB.id)
    await save(localA.id, 1, staffA, [], [volunteerA])
    assert.equal((await one(`SELECT count(*)::int AS count FROM public.profile_groups WHERE profile_id='${staffB}' AND group_id='${localB.id}'`)).count, 1)
    assert.equal((await one(`SELECT label FROM public.groups WHERE id='${localB.id}'`)).label, 'Legacy shared group')
    assert.equal((await one("SELECT count(*)::int AS count FROM public.groups WHERE id='legacy'")).count, 1)
    await db.exec(migration)
    assert.equal((await one(`SELECT count(*)::int AS count FROM public.profile_groups WHERE profile_id='${volunteerA}' AND group_id='${localA.id}'`)).count, 0)
  })
  await check('create group with members and eligible employee atomically', async () => {
    await save('a', 1, staffA, [volunteerA, staffA], [], true)
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='a'")).responsible_profile_id, staffA)
    assert.equal((await one("SELECT count(*)::int AS count FROM public.profile_groups WHERE group_id='a'")).count, 2)
  })
  for (const [name, id] of [['foreign employee', staffB], ['volunteer', volunteerA], ['pending invite', invited], ['inactive employee', inactive], ['kiosk', kiosk]]) {
    await check(`reject ${name} as responsible and roll back label/membership changes`, async () => {
      await assert.rejects(save('a', 1, id, [], [volunteerA], false, 'Must not persist'))
      assert.equal((await one("SELECT label FROM public.groups WHERE id='a'")).label, 'Edited')
      assert.equal((await one(`SELECT count(*)::int AS count FROM public.profile_groups WHERE group_id='a' AND profile_id='${volunteerA}'`)).count, 1)
    })
  }
  for (const [name, id] of [['foreign member', staffB], ['pending invite', invited], ['inactive member', inactive], ['kiosk member', kiosk]]) {
    await check(`reject ${name} and preserve group`, async () => {
      await assert.rejects(save('a', 1, staffA, [id], [], false, 'Invalid'))
      assert.equal((await one("SELECT label FROM public.groups WHERE id='a'")).label, 'Edited')
    })
  }
  await check('reject another congregation and shared group', async () => {
    await assert.rejects(save('a', 2, null))
    await db.exec("INSERT INTO public.groups(id,label,church_id) VALUES('shared','Shared',NULL)")
    await assert.rejects(save('shared', 1, null))
  })
  await check('membership delta preserves unrelated groups and is idempotent', async () => {
    await db.query("INSERT INTO public.profile_groups VALUES($1,'existing')", [volunteerA])
    await save('a', 1, staffA, [staffA], [volunteerA])
    await save('a', 1, staffA, [staffA], [volunteerA])
    assert.equal((await one(`SELECT count(*)::int AS count FROM public.profile_groups WHERE group_id='existing' AND profile_id='${volunteerA}'`)).count, 1)
    assert.equal((await one("SELECT count(*)::int AS count FROM public.profile_groups WHERE group_id='a'")).count, 1)
  })
  await check('reject direct RPC calls from authenticated and anonymous clients', async () => {
    for (const role of ['authenticated', 'anon']) {
      assert.equal((await one(`SELECT has_function_privilege('${role}', 'public.save_group_management(text,integer,text,text,uuid,uuid[],uuid[],boolean)', 'EXECUTE') AS allowed`)).allowed, false)
      await db.exec(`SET ROLE ${role}`)
      try { await assert.rejects(save('a', 1, null), error => error.code === '42501') }
      finally { await db.exec('RESET ROLE') }
    }
    assert.equal((await one("SELECT has_function_privilege('service_role', 'public.save_group_management(text,integer,text,text,uuid,uuid[],uuid[],boolean)', 'EXECUTE') AS allowed")).allowed, true)
  })
  await check('service role can execute RPC and validation triggers with table grants', async () => {
    await db.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; SET ROLE service_role')
    try { await save('server-created', 1, staffA, [volunteerA], [], true) }
    finally { await db.exec('RESET ROLE') }
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='server-created'")).responsible_profile_id, staffA)
  })
  await check('employee leaving one congregation clears only that local responsibility', async () => {
    await db.query("INSERT INTO public.profile_churches VALUES($1,2,'anstalld',true,true,now())", [staffA])
    await save('b', 2, staffA, [], [], true)
    await db.query('UPDATE public.profile_churches SET active=false WHERE profile_id=$1 AND church_id=1', [staffA])
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='a'")).responsible_profile_id, null)
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='b'")).responsible_profile_id, staffA)
  })
  await check('role change to volunteer clears responsibility', async () => {
    await db.query("UPDATE public.profile_churches SET role='ideell',is_employee=false WHERE profile_id=$1 AND church_id=2", [staffA])
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='b'")).responsible_profile_id, null)
  })
  await check('membership deletion clears responsibility without deleting the group', async () => {
    await save('c', 2, staffB, [], [], true)
    await db.query('DELETE FROM public.profile_churches WHERE profile_id=$1 AND church_id=2', [staffB])
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='c'")).responsible_profile_id, null)
  })
  await check('profile deletion sets responsibility to null', async () => {
    await db.query('UPDATE public.profile_churches SET active=true WHERE profile_id=$1 AND church_id=1', [staffA])
    await save('a', 1, staffA)
    await db.query('DELETE FROM public.profiles WHERE id=$1', [staffA])
    assert.equal((await one("SELECT responsible_profile_id FROM public.groups WHERE id='a'")).responsible_profile_id, null)
  })
  console.log(`${passed} PostgreSQL integration checks passed`)
} finally { await db.close() }
