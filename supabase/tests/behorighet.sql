-- Behörighetstester. Kör ENBART mot testdatabasen, efter migration 019. Se README.md.
-- Profiler ändras av appens server (service role); inloggade användare kan bara
-- ändra sina egna kontaktuppgifter. Behörighet styrs av profile_churches.
-- Resultatet ska ha status OK på varje rad.

DO $$
BEGIN
  IF (SELECT count(*) FROM churches WHERE name IN ('Test Församling A', 'Test Församling B')) <> 2 THEN
    RAISE EXCEPTION 'Testförsamlingarna saknas. Detta ser inte ut som testdatabasen, avbryter.';
  END IF;
END $$;

-- Testkonton (skapas bara om de saknas). Metadata försöker ge superadmin, vilket ska ignoreras.
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-00000000a001'::uuid,'sec-sup@test.invalid','Säk Super'),
    ('00000000-0000-0000-0000-00000000a002'::uuid,'sec-padA@test.invalid','Säk PastoratA'),
    ('00000000-0000-0000-0000-00000000a003'::uuid,'sec-fadA@test.invalid','Säk FadminA'),
    ('00000000-0000-0000-0000-00000000a004'::uuid,'sec-fadB@test.invalid','Säk FadminB'),
    ('00000000-0000-0000-0000-00000000a005'::uuid,'sec-ideA@test.invalid','Säk IdeellA'),
    ('00000000-0000-0000-0000-00000000a006'::uuid,'sec-ideB@test.invalid','Säk IdeellB')
  ) AS t(id,email,name) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (u.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',u.email,'',now(),
            jsonb_build_object('name',u.name,'role','superadmin','admin_level','super'),'{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- Test 0: registrering med superadmin i metadata ska ge en vanlig ideell
CREATE SCHEMA IF NOT EXISTS sec_test;
REVOKE ALL ON SCHEMA sec_test FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS sec_test.results (n int, test text, expected text, got text);
TRUNCATE sec_test.results;
INSERT INTO sec_test.results
SELECT 0, 'Registrering med superadmin i metadata blir ideell', 'none',
       (SELECT admin_level FROM profiles WHERE id = '00000000-0000-0000-0000-00000000a001'
          AND created_at > now() - interval '1 minute')
WHERE EXISTS (SELECT 1 FROM profiles WHERE id = '00000000-0000-0000-0000-00000000a001' AND created_at > now() - interval '1 minute');

-- Sätt rätt roller (som appens server gör)
UPDATE profiles p SET role = t.role, admin_level = t.lvl, church_id = (SELECT id FROM churches WHERE name = t.ch), is_employee = t.role <> 'ideell'
FROM (VALUES ('sec-sup@test.invalid','superadmin','super','Test Församling A'),
 ('sec-padA@test.invalid','padmin','pastorat','Test Församling A'),
 ('sec-fadA@test.invalid','fadmin','forsamling','Test Församling A'),
 ('sec-fadB@test.invalid','fadmin','forsamling','Test Församling B'),
 ('sec-ideA@test.invalid','ideell','none','Test Församling A'),
 ('sec-ideB@test.invalid','ideell','none','Test Församling B')) t(email,role,lvl,ch)
WHERE p.email = t.email;

-- Från och med migration 019 styrs behörighet av medlemskap per församling
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT id, church_id, role, admin_level, is_employee, true, now() FROM profiles
WHERE email LIKE 'sec-%@test.invalid' AND church_id IS NOT NULL
ON CONFLICT (profile_id, church_id) DO UPDATE
  SET role = EXCLUDED.role, admin_level = EXCLUDED.admin_level, is_employee = EXCLUDED.is_employee,
      active = true, accepted_at = COALESCE(profile_churches.accepted_at, now());

-- Väntande inbjudan: församlingsadmin A är inbjuden som admin i B men har inte accepterat
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000a003', id, 'fadmin', 'forsamling', true, true, NULL
FROM churches WHERE name = 'Test Församling B'
ON CONFLICT (profile_id, church_id) DO UPDATE SET accepted_at = NULL, active = true, admin_level = 'forsamling', role = 'fadmin';

-- Ett opublicerat pass i A
INSERT INTO passes (church_id, title, date_str, time_str, spots, pub_status)
SELECT id, 'Säk-utkast A', '2030-12-03', '10:00–12:00', 3, 'scheduled' FROM churches
WHERE name = 'Test Församling A' AND NOT EXISTS (SELECT 1 FROM passes WHERE title = 'Säk-utkast A');

INSERT INTO passes (church_id, title, date_str, time_str, spots)
SELECT id, 'Säk-pass ' || name, '2030-12-01', '10:00–12:00', 3 FROM churches
WHERE name LIKE 'Test Församling %' AND NOT EXISTS (SELECT 1 FROM passes WHERE title = 'Säk-pass ' || churches.name);

DO $$
DECLARE
  t record; res text; results text[][] := '{}';
  sup  uuid := '00000000-0000-0000-0000-00000000a001';
  padA uuid := '00000000-0000-0000-0000-00000000a002';
  fadA uuid := '00000000-0000-0000-0000-00000000a003';
  fadB uuid := '00000000-0000-0000-0000-00000000a004';
  ideA uuid := '00000000-0000-0000-0000-00000000a005';
  ideB uuid := '00000000-0000-0000-0000-00000000a006';
  a int := (SELECT id FROM churches WHERE name = 'Test Församling A');
  b int := (SELECT id FROM churches WHERE name = 'Test Församling B');
  passA int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling A');
  passB int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling B');
  draftA int := (SELECT id FROM passes WHERE title = 'Säk-utkast A');
  upd text := $q$WITH u AS (UPDATE profiles SET %s WHERE id = %L RETURNING 1) SELECT count(*)::text FROM u$q$;
BEGIN
  FOR t IN SELECT * FROM (VALUES
   (1,'Ideell gör sig till superadmin',ideA,format(upd,$s$admin_level='super', role='superadmin'$s$,ideA),'ERROR'),
   (2,'Ideell byter egen församling',ideA,format(upd,format('church_id=%s',b),ideA),'ERROR'),
   (3,'Ideell ändrar eget namn',ideA,format(upd,$s$name='Säk IdeellA'$s$,ideA),'1'),
   (4,'Ideell ser bara sin egen profil',ideA,$q$SELECT count(*)::text FROM profiles$q$,'1'),
   (5,'Ideell ser pass i annan församling',ideA,format($q$SELECT count(*)::text FROM passes WHERE id=%s$q$,passB),'0'),
   (6,'Ideell bokar in annan person',ideA,format($q$WITH u AS (INSERT INTO bookings (pass_id, profile_id, name) VALUES (%s, %L, 'x') RETURNING 1) SELECT count(*)::text FROM u$q$,passA,fadA),'ERROR'),
   (7,'Ideell gör sig ansvarig för pass',ideB,format($q$WITH u AS (INSERT INTO pass_responsible (pass_id, profile_id) VALUES (%s, %L) RETURNING 1) SELECT count(*)::text FROM u$q$,passB,ideB),'ERROR'),
   (8,'Ideell ändrar pass',ideA,format($q$WITH u AS (UPDATE passes SET title='hackad' WHERE id=%s RETURNING 1) SELECT count(*)::text FROM u$q$,passA),'0'),
   (9,'Ideell skapar profil med adminnivå',ideA,$q$WITH u AS (INSERT INTO profiles (id,name,admin_level,role) VALUES (gen_random_uuid(),'x','super','superadmin') RETURNING 1) SELECT count(*)::text FROM u$q$,'ERROR'),
   (10,'Fadmin A ser personer i B',fadA,format($q$SELECT count(*)::text FROM profiles WHERE church_id=%s$q$,b),'0'),
   (11,'Fadmin A ändrar person i B',fadA,format(upd,$s$name='hackad'$s$,ideB),'0'),
   (12,'Fadmin A raderar person i B',fadA,format($q$WITH u AS (DELETE FROM profiles WHERE id=%L RETURNING 1) SELECT count(*)::text FROM u$q$,ideB),'0'),
   (13,'Fadmin A degraderar pastoratsadmin',fadA,format(upd,$s$admin_level='none', role='ideell'$s$,padA),'ERROR'),
   (14,'Fadmin A gör sig till pastoratsadmin',fadA,format(upd,$s$admin_level='pastorat', role='padmin'$s$,fadA),'ERROR'),
   (15,'Fadmin A befordrar ideell A till super',fadA,format(upd,$s$admin_level='super', role='superadmin'$s$,ideA),'ERROR'),
   (16,'Fadmin A ändrar pass i B',fadA,format($q$WITH u AS (UPDATE passes SET title='hackad' WHERE id=%s RETURNING 1) SELECT count(*)::text FROM u$q$,passB),'0'),
   (17,'Fadmin A skapar pass i B',fadA,format($q$WITH u AS (INSERT INTO passes (church_id,title,date_str,time_str,spots) VALUES (%s,'hack','2030-12-02','10:00',1) RETURNING 1) SELECT count(*)::text FROM u$q$,b),'ERROR'),
   (18,'Fadmin ger sig själv personalbehörighet',fadA,format($q$WITH u AS (INSERT INTO profile_church_permissions (profile_id, church_id, kan_skapa_pass) VALUES (%L, %s, true) RETURNING 1) SELECT count(*)::text FROM u$q$,fadA,a),'ERROR'),
   (19,'Fadmin B ser personer i A',fadB,format($q$SELECT count(*)::text FROM profiles WHERE church_id=%s$q$,a),'0'),
   (20,'Pastoratsadmin ser personer i B (samma pastorat)',padA,format($q$SELECT (count(*) > 0)::text FROM profiles WHERE church_id=%s$q$,b),'true'),
   (21,'Superadmin ser alla',sup,$q$SELECT (count(*) >= 6)::text FROM profiles$q$,'true'),
   (22,'Fadmin A ser personer i A',fadA,format($q$SELECT (count(*) >= 4)::text FROM profiles WHERE church_id=%s$q$,a),'true'),
   (23,'Ideell skapar eget medlemskap i B',ideA,format($q$WITH u AS (INSERT INTO profile_churches (profile_id, church_id) VALUES (%L, %s) RETURNING 1) SELECT count(*)::text FROM u$q$,ideA,b),'ERROR'),
   (24,'Ideell ändrar sin nivå i medlemskap',ideA,format($q$WITH u AS (UPDATE profile_churches SET admin_level='super' WHERE profile_id=%L RETURNING 1) SELECT count(*)::text FROM u$q$,ideA),'ERROR'),
   (25,'Ideell ser medlemskap i sin församling',ideA,format($q$SELECT count(*)::text FROM profile_churches WHERE church_id=%s$q$,a),'1'),
   (26,'Fadmin A ser medlemskap i A',fadA,format($q$SELECT (count(*) >= 4)::text FROM profile_churches WHERE church_id=%s$q$,a),'true'),
   (27,'Fadmin A ser bara sin egen väntande rad i B',fadA,format($q$SELECT count(*)::text FROM profile_churches WHERE church_id=%s$q$,b),'1'),
   (28,'Väntande admin i B ser inte personer i B',fadA,format($q$SELECT count(*)::text FROM profiles WHERE church_id=%s$q$,b),'0'),
   (29,'Väntande admin i B skapar pass i B',fadA,format($q$WITH u AS (INSERT INTO passes (church_id,title,date_str,time_str,spots) VALUES (%s,'hack','2030-12-02','10:00',1) RETURNING 1) SELECT count(*)::text FROM u$q$,b),'ERROR'),
   (30,'Väntande admin i B ser pass i B',fadA,format($q$SELECT count(*)::text FROM passes WHERE id=%s$q$,passB),'0'),
   (31,'Ideell bokar sig på opublicerat pass',ideA,format($q$WITH u AS (INSERT INTO bookings (pass_id, profile_id, name) VALUES (%s, %L, 'x') RETURNING 1) SELECT count(*)::text FROM u$q$,draftA,ideA),'ERROR'),
   (32,'Ideell skriver i gamla staff_permissions',ideA,format($q$WITH u AS (INSERT INTO staff_permissions (profile_id, kan_skapa_pass) VALUES (%L, true) RETURNING 1) SELECT count(*)::text FROM u$q$,ideA),'ERROR')
  ) AS v(n,test,uid,sql,expected) LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',t.uid,'role','authenticated')::text, true);
    PERFORM set_config('role','authenticated', true);
    BEGIN
      EXECUTE t.sql INTO res;
    EXCEPTION WHEN others THEN
      res := 'ERROR';
    END;
    PERFORM set_config('role','postgres', true);
    results := results || array[[t.n::text, t.test, t.expected, res]];
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO sec_test.results
  SELECT results[i][1]::int, results[i][2], results[i][3], results[i][4] FROM generate_subscripts(results,1) i;
END $$;

-- Städa väntande inbjudan och utkast
DELETE FROM profile_churches WHERE profile_id = '00000000-0000-0000-0000-00000000a003'
  AND church_id = (SELECT id FROM churches WHERE name = 'Test Församling B');
DELETE FROM passes WHERE title = 'Säk-utkast A';

SELECT n, test, expected, got, CASE WHEN expected = got THEN 'OK' ELSE 'FEL' END AS status
FROM sec_test.results ORDER BY n;
