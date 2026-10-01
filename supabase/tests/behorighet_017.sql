-- Behörighetstester för migration 017 och 019 (församlingar och utskick). Kör ENBART mot testdatabasen, EFTER behorighet.sql
-- (som skapar testkontona). Resultatet ska ha status OK på varje rad.

DO $$
BEGIN
  IF (SELECT count(*) FROM churches WHERE name IN ('Test Församling A', 'Test Församling B')) <> 2 THEN
    RAISE EXCEPTION 'Testförsamlingarna saknas. Detta ser inte ut som testdatabasen, avbryter.';
  END IF;
END $$;

-- Förberedelser (som postgres)
INSERT INTO pastorat (name) SELECT 'Säk pastorat 2' WHERE NOT EXISTS (SELECT 1 FROM pastorat WHERE name = 'Säk pastorat 2');
INSERT INTO bookings (pass_id, profile_id, name)
SELECT p.id, '00000000-0000-0000-0000-00000000a005', 'Säk IdeellA' FROM passes p
WHERE p.title = 'Säk-pass Test Församling A'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.pass_id = p.id AND b.profile_id = '00000000-0000-0000-0000-00000000a005');
-- Från 019 hör utskick till en församling (church_id)
DELETE FROM message_logs WHERE subject = 'Säk-logg B';
INSERT INTO message_logs (from_user_id, from_name, to_label, subject, body, church_id)
SELECT '00000000-0000-0000-0000-00000000a004', 'Säk FadminB', 'Test', 'Säk-logg B', 'x', id
FROM churches WHERE name = 'Test Församling B';

CREATE SCHEMA IF NOT EXISTS sec_test;
CREATE TABLE IF NOT EXISTS sec_test.results17 (n int, test text, expected text, got text);
TRUNCATE sec_test.results17;

DO $$
DECLARE
  t record; res text; results text[][] := '{}';
  sup  uuid := '00000000-0000-0000-0000-00000000a001';
  padA uuid := '00000000-0000-0000-0000-00000000a002';
  fadA uuid := '00000000-0000-0000-0000-00000000a003';
  fadB uuid := '00000000-0000-0000-0000-00000000a004';
  ideA uuid := '00000000-0000-0000-0000-00000000a005';
  a int := (SELECT id FROM churches WHERE name = 'Test Församling A');
  b int := (SELECT id FROM churches WHERE name = 'Test Församling B');
  p2 int := (SELECT id FROM pastorat WHERE name = 'Säk pastorat 2');
  p1 int := (SELECT pastorat_id FROM churches WHERE name = 'Test Församling A');
  passA int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling A');
BEGIN
  FOR t IN SELECT * FROM (VALUES
   (101,'Pastoratsadmin flyttar församling B till annat pastorat',padA,format($q$WITH u AS (UPDATE churches SET pastorat_id=%s WHERE id=%s RETURNING 1) SELECT count(*)::text FROM u$q$,p2,b),'ERROR'),
   (102,'Pastoratsadmin ändrar telefon för församling A',padA,format($q$WITH u AS (UPDATE churches SET tel='070-000 00 01' WHERE id=%s RETURNING 1) SELECT count(*)::text FROM u$q$,a),'1'),
   (103,'Pastoratsadmin skapar församling i annat pastorat',padA,format($q$WITH u AS (INSERT INTO churches (name, pastorat_id) VALUES ('Säk hack', %s) RETURNING 1) SELECT count(*)::text FROM u$q$,p2),'ERROR'),
   (104,'Pastoratsadmin skapar församling i eget pastorat',padA,format($q$WITH u AS (INSERT INTO churches (name, pastorat_id) VALUES ('Säk ny', %s) RETURNING 1) SELECT count(*)::text FROM u$q$,p1),'1'),
   (105,'Församlingsadmin ändrar sin församling',fadA,format($q$WITH u AS (UPDATE churches SET tel='x' WHERE id=%s RETURNING 1) SELECT count(*)::text FROM u$q$,a),'0'),
   (106,'Ideell svarar som personal på bokat pass',ideA,format($q$WITH u AS (INSERT INTO pass_messages (pass_id, author_id, author_name, body, is_staff_reply) VALUES (%s,%L,'x','x',true) RETURNING 1) SELECT count(*)::text FROM u$q$,passA,ideA),'ERROR'),
   (107,'Ideell ställer fråga på bokat pass',ideA,format($q$WITH u AS (INSERT INTO pass_messages (pass_id, author_id, author_name, body, is_staff_reply) VALUES (%s,%L,'Säk IdeellA','Säk-fråga',false) RETURNING 1) SELECT count(*)::text FROM u$q$,passA,ideA),'1'),
   (108,'Församlingsadmin A läser utskick från B',fadA,format($q$SELECT count(*)::text FROM message_logs WHERE from_user_id=%L$q$,fadB),'0'),
   (109,'Församlingsadmin B läser eget utskick',fadB,format($q$SELECT count(*)::text FROM message_logs WHERE from_user_id=%L$q$,fadB),'1'),
   (110,'Superadmin läser utskick från B',sup,format($q$SELECT count(*)::text FROM message_logs WHERE from_user_id=%L$q$,fadB),'1'),
   (111,'Församlingsadmin A loggar utskick i församling B',fadA,format($q$WITH u AS (INSERT INTO message_logs (from_user_id, from_name, to_label, subject, body, church_id) VALUES (%L,'x','x','x','x',%s) RETURNING 1) SELECT count(*)::text FROM u$q$,fadA,b),'ERROR')
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
  INSERT INTO sec_test.results17
  SELECT results[i][1]::int, results[i][2], results[i][3], results[i][4] FROM generate_subscripts(results,1) i;
END $$;

-- Städa upp testdata från körningen
DELETE FROM churches WHERE name = 'Säk ny';
DELETE FROM pass_messages WHERE body = 'Säk-fråga';

SELECT n, test, expected, got, CASE WHEN expected = got THEN 'OK' ELSE 'FEL' END AS status
FROM sec_test.results17 ORDER BY n;
