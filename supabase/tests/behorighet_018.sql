-- Behörighetstester för migration 018 (kommentarer på pass). Kör ENBART mot testdatabasen,
-- EFTER behorighet.sql (som skapar testkontona a001-a006). Resultatet ska ha status OK på varje rad.

DO $$
BEGIN
  IF (SELECT count(*) FROM churches WHERE name IN ('Test Församling A', 'Test Församling B')) <> 2 THEN
    RAISE EXCEPTION 'Testförsamlingarna saknas. Detta ser inte ut som testdatabasen, avbryter.';
  END IF;
END $$;

-- Förberedelser (som postgres)

-- Nya testkonton: vaktmästare A, anställd A utan koppling, kiosk A, obokad ideell A
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-00000000a007'::uuid,'sec-vkA@test.invalid','Säk VaktmästareA'),
    ('00000000-0000-0000-0000-00000000a008'::uuid,'sec-anstA@test.invalid','Säk AnställdA'),
    ('00000000-0000-0000-0000-00000000a009'::uuid,'sec-kioskA@test.invalid','Säk KioskA'),
    ('00000000-0000-0000-0000-00000000a010'::uuid,'sec-ideA2@test.invalid','Säk IdeellA2')
  ) AS t(id,email,name) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (u.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',u.email,'',now(),
            jsonb_build_object('name',u.name),'{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

UPDATE profiles p SET role = t.role, admin_level = 'none', church_id = (SELECT id FROM churches WHERE name = 'Test Församling A'), is_employee = t.emp
FROM (VALUES ('00000000-0000-0000-0000-00000000a007'::uuid,'anstalld',true),
 ('00000000-0000-0000-0000-00000000a008'::uuid,'anstalld',true),
 ('00000000-0000-0000-0000-00000000a009'::uuid,'kiosk',false),
 ('00000000-0000-0000-0000-00000000a010'::uuid,'ideell',false)) t(id,role,emp)
WHERE p.id = t.id;

INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT id, church_id, role, admin_level, is_employee, true, now() FROM profiles
WHERE email LIKE 'sec-%@test.invalid' AND church_id IS NOT NULL
ON CONFLICT (profile_id, church_id) DO UPDATE
  SET role = EXCLUDED.role, admin_level = EXCLUDED.admin_level, is_employee = EXCLUDED.is_employee,
      active = true, accepted_at = COALESCE(profile_churches.accepted_at, now());

UPDATE passes SET vk_profile_id = '00000000-0000-0000-0000-00000000a007' WHERE title = 'Säk-pass Test Församling A';

INSERT INTO bookings (pass_id, profile_id, name)
SELECT p.id, '00000000-0000-0000-0000-00000000a005', 'Säk IdeellA' FROM passes p
WHERE p.title = 'Säk-pass Test Församling A'
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.pass_id = p.id AND b.profile_id = '00000000-0000-0000-0000-00000000a005');

-- Rensa kommentarer från tidigare körningar och lägg in nya utgångsdata
DELETE FROM pass_messages WHERE pass_id IN (SELECT id FROM passes WHERE title LIKE 'Säk-pass Test Församling %');

DO $$
DECLARE
  passA int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling A');
  passB int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling B');
  top_id bigint;
BEGIN
  INSERT INTO pass_messages (pass_id, author_id, author_name, body)
  VALUES (passA, '00000000-0000-0000-0000-00000000a005', 'Säk IdeellA', 'Säk18-topp') RETURNING id INTO top_id;
  INSERT INTO pass_messages (pass_id, author_id, author_name, body, parent_id)
  VALUES (passA, '00000000-0000-0000-0000-00000000a007', 'Säk VaktmästareA', 'Säk18-svar', top_id);
  INSERT INTO pass_messages (pass_id, author_id, author_name, body)
  VALUES (passA, '00000000-0000-0000-0000-00000000a007', 'Säk VaktmästareA', 'Säk18-vk');
  INSERT INTO pass_messages (pass_id, author_id, author_name, body)
  VALUES (passB, '00000000-0000-0000-0000-00000000a004', 'Säk FadminB', 'Säk18-B');
END $$;

CREATE SCHEMA IF NOT EXISTS sec_test;
CREATE TABLE IF NOT EXISTS sec_test.results18 (n int, test text, expected text, got text);
TRUNCATE sec_test.results18;

DO $$
DECLARE
  t record; res text; results text[][] := '{}';
  sup   uuid := '00000000-0000-0000-0000-00000000a001';
  padA  uuid := '00000000-0000-0000-0000-00000000a002';
  fadA  uuid := '00000000-0000-0000-0000-00000000a003';
  ideA  uuid := '00000000-0000-0000-0000-00000000a005';
  vkA   uuid := '00000000-0000-0000-0000-00000000a007';
  anstA uuid := '00000000-0000-0000-0000-00000000a008';
  kioA  uuid := '00000000-0000-0000-0000-00000000a009';
  ideA2 uuid := '00000000-0000-0000-0000-00000000a010';
  passA int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling A');
  passB int := (SELECT id FROM passes WHERE title = 'Säk-pass Test Församling B');
  mTop   bigint := (SELECT id FROM pass_messages WHERE body = 'Säk18-topp');
  mReply bigint := (SELECT id FROM pass_messages WHERE body = 'Säk18-svar');
  mVk    bigint := (SELECT id FROM pass_messages WHERE body = 'Säk18-vk');
  mB     bigint := (SELECT id FROM pass_messages WHERE body = 'Säk18-B');
  rd  text := $q$SELECT count(*)::text FROM pass_messages WHERE id = %s$q$;
  ins text := $q$WITH u AS (INSERT INTO pass_messages (pass_id, author_id, author_name, body, parent_id, is_staff_reply) VALUES (%s, %L, 'x', %L, %s, %s) RETURNING 1) SELECT count(*)::text FROM u$q$;
  upd text := $q$WITH u AS (UPDATE pass_messages SET %s WHERE id = %s RETURNING 1) SELECT count(*)::text FROM u$q$;
  men text := $q$WITH u AS (INSERT INTO pass_message_mentions (message_id, profile_id) VALUES (%s, %L) RETURNING 1) SELECT count(*)::text FROM u$q$;
BEGIN
  FOR t IN SELECT * FROM (VALUES
   (201,'Bokad ideell läser kommentar',ideA,format(rd,mTop),'1'),
   (202,'Bokad ideell skriver kommentar',ideA,format(ins,passA,ideA,'Säk18-ny','NULL','false'),'1'),
   (203,'Obokad ideell i samma församling läser',ideA2,format(rd,mTop),'0'),
   (204,'Obokad ideell i samma församling skriver',ideA2,format(ins,passA,ideA2,'Säk18-hack','NULL','false'),'ERROR'),
   (205,'Vaktmästare läser',vkA,format(rd,mTop),'1'),
   (206,'Vaktmästare skriver',vkA,format(ins,passA,vkA,'Säk18-vk2','NULL','false'),'1'),
   (207,'Anställd utan koppling läser',anstA,format(rd,mTop),'0'),
   (208,'Kiosk läser',kioA,format(rd,mTop),'0'),
   (209,'Kiosk skriver',kioA,format(ins,passA,kioA,'Säk18-hack','NULL','false'),'ERROR'),
   (210,'Svar på svar',ideA,format(ins,passA,ideA,'Säk18-hack',mReply,'false'),'ERROR'),
   (211,'Svar till kommentar på annat pass',ideA,format(ins,passA,ideA,'Säk18-hack',mB,'false'),'ERROR'),
   (212,'Ideell svarar på kommentar',ideA,format(ins,passA,ideA,'Säk18-svar2',mTop,'false'),'1'),
   (213,'Ideell ändrar author_id',ideA,format(upd,format('author_id=%L',vkA),mTop),'ERROR'),
   (214,'Ideell flyttar kommentar till annat pass',ideA,format(upd,format('pass_id=%s',passB),mTop),'ERROR'),
   (215,'Ideell redigerar annans kommentar',ideA,format(upd,$s$body='hackad'$s$,mVk),'0'),
   (216,'Ideell redigerar egen kommentar',ideA,format(upd,$s$body='Säk18-topp ändrad'$s$,mTop),'1'),
   (217,'Redigerad kommentar får edited_at',ideA,format($q$SELECT (edited_at IS NOT NULL)::text FROM pass_messages WHERE id = %s$q$,mTop),'true'),
   (218,'Fadmin A tar bort kommentar i B',fadA,format(upd,$s$deleted_at=now(), body=''$s$,mB),'0'),
   (219,'Fadmin A ändrar text i annans kommentar i A',fadA,format(upd,$s$body='hackad'$s$,mTop),'ERROR'),
   (220,'Fadmin A tar bort kommentar i A',fadA,format(upd,$s$deleted_at=now(), body=''$s$,mVk),'1'),
   (221,'Borttagen kommentar kan inte återställas',vkA,format(upd,$s$deleted_at=NULL, body='tillbaka'$s$,mVk),'ERROR'),
   (222,'Ideell nämner person utan åtkomst',ideA,format(men,mTop,ideA2),'ERROR'),
   (223,'Ideell nämner vaktmästaren',ideA,format(men,mTop,vkA),'1'),
   (224,'Ideell nämner i annans kommentar',ideA,format(men,mReply,ideA),'ERROR'),
   (225,'Vaktmästare ser nämningen',vkA,format($q$SELECT count(*)::text FROM pass_message_mentions WHERE message_id = %s$q$,mTop),'1'),
   (226,'Anställd utan koppling ser nämningen',anstA,format($q$SELECT count(*)::text FROM pass_message_mentions WHERE message_id = %s$q$,mTop),'0'),
   (227,'Ideell sätter is_staff_reply',ideA,format(ins,passA,ideA,'Säk18-hack','NULL','true'),'ERROR'),
   (228,'Text över 2000 tecken',ideA,format(ins,passA,ideA,repeat('x',2001),'NULL','false'),'ERROR'),
   (229,'Ideell raderar egen kommentar på riktigt',ideA,format($q$WITH u AS (DELETE FROM pass_messages WHERE id = %s RETURNING 1) SELECT count(*)::text FROM u$q$,mTop),'0'),
   (230,'Obokad kartlägger vaktmästarens åtkomst',ideA2,format($q$SELECT public.can_access_pass_thread(%s, %L)::text$q$,passA,vkA),'false'),
   (231,'Bokad kontrollerar vaktmästarens åtkomst',ideA,format($q$SELECT public.can_access_pass_thread(%s, %L)::text$q$,passA,vkA),'true'),
   (232,'Pastoratsadmin läser kommentar i B (samma pastorat)',padA,format(rd,mB),'1'),
   (233,'Superadmin läser kommentar i B',sup,format(rd,mB),'1'),
   (234,'Ideell anropar intern behörighetsfunktion',ideA,format($q$SELECT public.pass_thread_access_for(%s, %L)::text$q$,passA,vkA),'ERROR')
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
  INSERT INTO sec_test.results18
  SELECT results[i][1]::int, results[i][2], results[i][3], results[i][4] FROM generate_subscripts(results,1) i;
END $$;

-- Städa upp testdata från körningen
DELETE FROM pass_messages WHERE pass_id IN (SELECT id FROM passes WHERE title LIKE 'Säk-pass Test Församling %');
UPDATE passes SET vk_profile_id = NULL WHERE title = 'Säk-pass Test Församling A' AND vk_profile_id = '00000000-0000-0000-0000-00000000a007';

SELECT n, test, expected, got, CASE WHEN expected = got THEN 'OK' ELSE 'FEL' END AS status
FROM sec_test.results18 ORDER BY n;
