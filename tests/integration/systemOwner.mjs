// Run with PGLITE_MODULE_PATH pointing at an external installation of @electric-sql/pglite.
// No remote database, credentials, accounts or messages are used.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(`${process.env.PGLITE_MODULE_PATH}/package.json`)
const { PGlite } = require('@electric-sql/pglite')
const db = new PGlite()
const owner = '00000000-0000-0000-0000-000000000001'
const other = '00000000-0000-0000-0000-000000000002'
let checks = 0
const check = async (sql, expected) => {
  const { rows } = await db.query(sql)
  assert.deepEqual(rows[0].result, expected, sql)
  checks++
}
const denied = async sql => {
  await assert.rejects(db.exec(sql))
  checks++
}
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true),'')::UUID; $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    CREATE TABLE profiles(id UUID PRIMARY KEY, admin_level TEXT);
    CREATE TABLE churches(id INT PRIMARY KEY, pastorat_id INT);
    CREATE TABLE profile_churches(profile_id UUID, church_id INT, admin_level TEXT, active BOOLEAN, accepted_at TIMESTAMPTZ);
    CREATE FUNCTION level_rank(lvl TEXT) RETURNS INT LANGUAGE SQL AS $$
      SELECT CASE lvl WHEN 'super' THEN 3 WHEN 'pastorat' THEN 2 WHEN 'forsamling' THEN 1 ELSE 0 END; $$;
    INSERT INTO profiles VALUES ('${owner}','none'),('${other}','super');
    INSERT INTO churches VALUES (1,1),(2,1),(3,2),(4,NULL);
    INSERT INTO profile_churches VALUES ('${other}',1,'super',true,now());
    SELECT set_config('request.jwt.claim.sub','${other}',false);
  `)
  const migration = readFileSync(new URL('../../supabase/migrations/021_systemagare.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await check('SELECT is_system_super_admin() AS result', false)
  await check('SELECT current_admin_level() AS result', 'pastorat')
  await check('SELECT can_admin_church(2) AS result', true)
  await check('SELECT can_admin_church(3) AS result', false)
  await check('SELECT can_admin_church_for(4,auth.uid()) AS result', false)
  await db.exec('SET ROLE authenticated')
  await denied(`SELECT claim_system_owner('${other}')`)
  await denied('SELECT * FROM system_owner')
  await db.exec('RESET ROLE; SET ROLE anon')
  await denied(`SELECT claim_system_owner('${other}')`)
  await db.exec('RESET ROLE; SET ROLE service_role')
  await check(`SELECT claim_system_owner('${owner}') AS result`, true)
  await check(`SELECT claim_system_owner('${owner}') AS result`, true)
  await denied(`SELECT claim_system_owner('${other}')`)
  await denied(`UPDATE system_owner SET profile_id = '${other}'`)
  await denied('DELETE FROM system_owner')
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${owner}',false); SET ROLE authenticated`)
  await check('SELECT is_system_super_admin() AS result', true)
  await check('SELECT current_admin_level() AS result', 'super')
  await check('SELECT can_admin_church(3) AS result', true)
  await check("SELECT can_set_admin_level('super') AS result", false)
  await check("SELECT can_set_admin_level('pastorat') AS result", true)
  await denied(`INSERT INTO system_owner (profile_id) VALUES ('${other}')`)
  await db.exec('RESET ROLE')
  await check(`SELECT profile_max_level('${owner}') AS result`, 'super')
  await denied(`DELETE FROM profiles WHERE id='${owner}'`)
  await db.exec(migration)
  await check('SELECT is_system_super_admin() AS result', true)
  console.log(`${checks} system-owner SQL checks passed, including migration rerun.`)
} finally { await db.close() }
