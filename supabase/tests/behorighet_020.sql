-- Behörighetstester för migration 020 (gruppchatt). Kör ENBART mot testdatabasen,
-- EFTER behorighet.sql (som skapar testkontona a001-a006 och församlingarna). Resultatet
-- ska ha status OK på varje rad. Skapar egna påhittade konton (a011-a017) och grupper
-- (sec20_grp_*) och städar bort dem i slutet.
--
-- Regeln som testas: läsa kräver rad i profile_groups OCH aktivt, accepterat medlemskap
-- i gruppens församling (gemensam grupp: i någon församling). Kiosk nekas alltid. Ingen
-- admin (fadmin, padmin, superadmin) läser utan att vara med i gruppen. Klienten kan
-- inte skriva något direkt.

DO $$
BEGIN
  IF (SELECT count(*) FROM churches WHERE name IN ('Test Församling A', 'Test Församling B')) <> 2 THEN
    RAISE EXCEPTION 'Testförsamlingarna saknas. Detta ser inte ut som testdatabasen, avbryter.';
  END IF;
  IF (SELECT count(*) FROM profiles WHERE id IN (
        '00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000a003',
        '00000000-0000-0000-0000-00000000a005','00000000-0000-0000-0000-00000000a006')) <> 5 THEN
    RAISE EXCEPTION 'Testkontona saknas. Kör behorighet.sql först.';
  END IF;
  IF to_regclass('public.chat_messages') IS NULL THEN
    RAISE EXCEPTION 'Migration 020 saknas.';
  END IF;
END $$;

-- Städa tidigare körningar (grupperna tar med sig meddelanden, chattar och läsmarkeringar)
DELETE FROM groups WHERE id LIKE 'sec20_grp_%';
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-00000000a011','00000000-0000-0000-0000-00000000a012','00000000-0000-0000-0000-00000000a013',
  '00000000-0000-0000-0000-00000000a014','00000000-0000-0000-0000-00000000a015','00000000-0000-0000-0000-00000000a016',
  '00000000-0000-0000-0000-00000000a017');

-- Nya testkonton
-- a011 borttagen medlem, a012 inaktivt medlemskap, a013 ny medlem, a014 väntande inbjudan,
-- a015 kiosk, a016 medlem i båda församlingarna, a017 raderas under testet (GDPR)
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-00000000a011'::uuid,'sec20-removed@test.invalid','Säk20 Borttagen'),
    ('00000000-0000-0000-0000-00000000a012'::uuid,'sec20-inactive@test.invalid','Säk20 Inaktiv'),
    ('00000000-0000-0000-0000-00000000a013'::uuid,'sec20-new@test.invalid','Säk20 Ny'),
    ('00000000-0000-0000-0000-00000000a014'::uuid,'sec20-pending@test.invalid','Säk20 Väntande'),
    ('00000000-0000-0000-0000-00000000a015'::uuid,'sec20-kiosk@test.invalid','Säk20 Kiosk'),
    ('00000000-0000-0000-0000-00000000a016'::uuid,'sec20-multi@test.invalid','Säk20 Flera'),
    ('00000000-0000-0000-0000-00000000a017'::uuid,'sec20-gdpr@test.invalid','Säk20 Radera')
  ) AS t(id,email,name) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (u.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',u.email,'',now(),
            jsonb_build_object('name',u.name),'{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

UPDATE profiles SET role = 'kiosk' WHERE id = '00000000-0000-0000-0000-00000000a015';

-- Medlemskap (profile_churches). Kolumner: profil, församling, roll, aktiv, accepterad
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT m.pid, (SELECT id FROM churches WHERE name = m.church), m.role, 'none', false, m.active, CASE WHEN m.accepted THEN now() END
FROM (VALUES
  ('00000000-0000-0000-0000-00000000a011'::uuid,'Test Församling A','ideell',true,true),
  ('00000000-0000-0000-0000-00000000a012'::uuid,'Test Församling A','ideell',true,true),
  ('00000000-0000-0000-0000-00000000a013'::uuid,'Test Församling A','ideell',true,true),
  ('00000000-0000-0000-0000-00000000a014'::uuid,'Test Församling A','ideell',true,false),
  ('00000000-0000-0000-0000-00000000a015'::uuid,'Test Församling A','kiosk',true,true),
  ('00000000-0000-0000-0000-00000000a016'::uuid,'Test Församling A','ideell',true,true),
  ('00000000-0000-0000-0000-00000000a016'::uuid,'Test Församling B','ideell',true,true),
  ('00000000-0000-0000-0000-00000000a017'::uuid,'Test Församling A','ideell',true,true)
) AS m(pid,church,role,active,accepted)
ON CONFLICT (profile_id, church_id) DO UPDATE
  SET role = EXCLUDED.role, active = EXCLUDED.active, accepted_at = EXCLUDED.accepted_at;

-- Grupper (chatt skapas automatiskt av triggern)
INSERT INTO groups (id, label, church_id) VALUES
  ('sec20_grp_a', 'Säk20 Grupp A', (SELECT id FROM churches WHERE name = 'Test Församling A')),
  ('sec20_grp_b', 'Säk20 Grupp B', (SELECT id FROM churches WHERE name = 'Test Församling B')),
  ('sec20_grp_common', 'Säk20 Gemensam', NULL);

-- Gruppmedlemskap
-- ideA (a005) är gruppansvarig i A och har dessutom en rad i B utan att vara medlem i församling B.
INSERT INTO profile_groups (profile_id, group_id, is_leader, joined_at) VALUES
  ('00000000-0000-0000-0000-00000000a005','sec20_grp_a', true,  now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a005','sec20_grp_b', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a006','sec20_grp_b', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a006','sec20_grp_common', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a011','sec20_grp_a', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a012','sec20_grp_a', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a012','sec20_grp_common', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a014','sec20_grp_a', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a014','sec20_grp_common', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a015','sec20_grp_a', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a016','sec20_grp_a', false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000a016','sec20_grp_b', false, now() - interval '2 days');

-- Meddelanden (som server/postgres). m1 och m2 är äldre än a013:s inträde.
INSERT INTO chat_messages (group_id, author_id, body, client_id, created_at) VALUES
  ('sec20_grp_a', '00000000-0000-0000-0000-00000000a005', 'Säk20-A1', '00000000-0000-4000-8000-0000000020a1', now() - interval '1 day'),
  ('sec20_grp_a', '00000000-0000-0000-0000-00000000a016', 'Säk20-A2', '00000000-0000-4000-8000-0000000020a2', now() - interval '1 hour'),
  ('sec20_grp_b', '00000000-0000-0000-0000-00000000a006', 'Säk20-B1', '00000000-0000-4000-8000-0000000020b1', now() - interval '1 hour'),
  ('sec20_grp_common', '00000000-0000-0000-0000-00000000a006', 'Säk20-C1', '00000000-0000-4000-8000-0000000020c1', now() - interval '1 hour'),
  ('sec20_grp_a', '00000000-0000-0000-0000-00000000a017', 'Säk20-gdpr', '00000000-0000-4000-8000-0000000020d1', now() - interval '1 hour');

-- Ny medlem som kommer in efter att historiken finns
INSERT INTO profile_groups (profile_id, group_id) VALUES ('00000000-0000-0000-0000-00000000a013','sec20_grp_a');

-- Läsmarkeringar, och städning när någon lämnar eller slutar vara aktiv
INSERT INTO chat_reads (profile_id, group_id, last_read_message_id) VALUES
  ('00000000-0000-0000-0000-00000000a005','sec20_grp_a', 0),
  ('00000000-0000-0000-0000-00000000a016','sec20_grp_a', 0),
  ('00000000-0000-0000-0000-00000000a011','sec20_grp_a', 1),
  ('00000000-0000-0000-0000-00000000a012','sec20_grp_a', 1);
-- a011 tas bort ur gruppen, a012:s medlemskap blir inaktivt
DELETE FROM profile_groups WHERE profile_id = '00000000-0000-0000-0000-00000000a011' AND group_id = 'sec20_grp_a';
UPDATE profile_churches SET active = false
WHERE profile_id = '00000000-0000-0000-0000-00000000a012' AND church_id = (SELECT id FROM churches WHERE name = 'Test Församling A');

CREATE SCHEMA IF NOT EXISTS sec_test;
CREATE TABLE IF NOT EXISTS sec_test.results20 (n int, test text, expected text, got text);
TRUNCATE sec_test.results20;

DO $$
DECLARE
  t record; res text; results text[][] := '{}';
  sup   text := '00000000-0000-0000-0000-00000000a001';
  padA  text := '00000000-0000-0000-0000-00000000a002';
  fadA  text := '00000000-0000-0000-0000-00000000a003';
  ideA  text := '00000000-0000-0000-0000-00000000a005';
  ideB  text := '00000000-0000-0000-0000-00000000a006';
  removed text := '00000000-0000-0000-0000-00000000a011';
  inact text := '00000000-0000-0000-0000-00000000a012';
  newm  text := '00000000-0000-0000-0000-00000000a013';
  pend  text := '00000000-0000-0000-0000-00000000a014';
  kio   text := '00000000-0000-0000-0000-00000000a015';
  multi text := '00000000-0000-0000-0000-00000000a016';
  gdpr  text := '00000000-0000-0000-0000-00000000a017';
  m1 bigint := (SELECT id FROM chat_messages WHERE body = 'Säk20-A1');
  m2 bigint := (SELECT id FROM chat_messages WHERE body = 'Säk20-A2');
  mB bigint := (SELECT id FROM chat_messages WHERE body = 'Säk20-B1');
  mC bigint := (SELECT id FROM chat_messages WHERE body = 'Säk20-C1');
  c1  text := '00000000-0000-4000-8000-0000000020a1';
  rd  text := $q$SELECT count(*)::text FROM chat_messages WHERE id = %s$q$;
  cnt text := $q$SELECT count(*)::text FROM %s$q$;
  ins text := $q$WITH u AS (INSERT INTO chat_messages (group_id, author_id, body, client_id, reply_to_id) VALUES (%L, %L, %L, %L, %s) RETURNING 1) SELECT count(*)::text FROM u$q$;
  insnc text := $q$WITH u AS (INSERT INTO chat_messages (group_id, author_id, body, client_id) VALUES (%L, %L, 'dubblett', %L) ON CONFLICT (author_id, client_id) DO NOTHING RETURNING 1) SELECT count(*)::text FROM u$q$;
  upd text := $q$WITH u AS (UPDATE chat_messages SET %s WHERE id = %s RETURNING 1) SELECT count(*)::text FROM u$q$;
  unread text := $q$SELECT unread_count::text FROM chat_unread_counts() WHERE group_id = %L$q$;
BEGIN
  -- who: 'anon', 'postgres' (server) eller ett användar-id (inloggad, klientens roll)
  FOR t IN SELECT * FROM (VALUES
   -- Läsa i gruppchatt (grupp A: församling A)
   (301,'Medlem läser meddelande i sin grupp',ideA,format(rd,m1),'1'),
   (302,'Ny medlem läser gammal historik',newm,format(rd,m1),'1'),
   (303,'Borttagen gruppmedlem nekas',removed,format(rd,m1),'0'),
   (304,'Pastoratsadmin utan gruppmedlemskap nekas',padA,format(rd,m1),'0'),
   (305,'Superadmin utan gruppmedlemskap nekas',sup,format(rd,m1),'0'),
   (306,'Församlingsadmin utan gruppmedlemskap nekas',fadA,format(rd,m1),'0'),
   (307,'Medlem i flera församlingar läser grupp i A',multi,format(rd,m1),'1'),
   (308,'Medlem i flera församlingar läser grupp i B',multi,format(rd,mB),'1'),
   (309,'Inaktiv församlingsmedlem nekas',inact,format(rd,m1),'0'),
   (310,'Väntande inbjudan (ej accepterad) nekas',pend,format(rd,m1),'0'),
   (311,'Kiosk nekas även med rad i profile_groups',kio,format(rd,m1),'0'),
   (312,'Grupprad i B utan medlemskap i församling B nekas',ideA,format(rd,mB),'0'),
   (313,'Medlem i B läser inte grupp i A',ideB,format(rd,m1),'0'),
   (314,'Gemensam grupp: medlem i någon församling läser',ideB,format(rd,mC),'1'),
   (315,'Gemensam grupp: inaktiv nekas',inact,format(rd,mC),'0'),
   (316,'Gemensam grupp: superadmin utan gruppmedlemskap nekas',sup,format(rd,mC),'0'),
   (317,'Gemensam grupp: väntande inbjudan nekas',pend,format(rd,mC),'0'),
   (318,'Gemensam grupp: pastoratsadmin utan gruppmedlemskap nekas',padA,format(rd,mC),'0'),
   (319,'Anonym läser inte chatten',NULL,format(rd,m1),'ERROR'),
   -- Funktionerna
   (320,'is_group_chat_member: medlem',ideA,$q$SELECT public.is_group_chat_member('sec20_grp_a')::text$q$,'true'),
   (321,'is_group_chat_member: superadmin',sup,$q$SELECT public.is_group_chat_member('sec20_grp_a')::text$q$,'false'),
   (322,'is_group_chat_leader: gruppansvarig',ideA,$q$SELECT public.is_group_chat_leader('sec20_grp_a')::text$q$,'true'),
   (323,'is_group_chat_leader: vanlig medlem',multi,$q$SELECT public.is_group_chat_leader('sec20_grp_a')::text$q$,'false'),
   (324,'is_group_chat_leader: icke-medlem i annan grupp',ideA,$q$SELECT public.is_group_chat_leader('sec20_grp_b')::text$q$,'false'),
   (325,'can_post_in_group_chat: medlem',ideA,$q$SELECT public.can_post_in_group_chat('sec20_grp_a')::text$q$,'true'),
   (326,'can_post_in_group_chat: icke-medlem',padA,$q$SELECT public.can_post_in_group_chat('sec20_grp_a')::text$q$,'false'),
   (327,'Anonym anropar is_group_chat_member',NULL,$q$SELECT public.is_group_chat_member('sec20_grp_a')::text$q$,'ERROR'),
   (328,'Okänd grupp ger false',ideA,$q$SELECT public.is_group_chat_member('finns-inte')::text$q$,'false'),
   (329,'Klient anropar intern triggerfunktion',ideA,$q$SELECT public.chat_messages_after_insert()::text$q$,'ERROR'),
   -- Olästa
   (330,'chat_unread_counts: bara egna chattar (A, inte B)',ideA,format(cnt,'chat_unread_counts() WHERE group_id LIKE ''sec20_grp_%'''),'1'),
   (331,'chat_unread_counts: medlem i två församlingar ser två',multi,format(cnt,'chat_unread_counts() WHERE group_id LIKE ''sec20_grp_%'''),'2'),
   (332,'chat_unread_counts: superadmin utan medlemskap ser inga',sup,format(cnt,'chat_unread_counts() WHERE group_id LIKE ''sec20_grp_%'''),'0'),
   (333,'Olästa: andras meddelanden räknas, eget inte (A1 och gdpr, inte A2)',multi,format(unread,'sec20_grp_a'),'2'),
   (334,'Olästa: gruppansvarig räknar A2 och gdpr, inte sitt eget A1',ideA,format(unread,'sec20_grp_a'),'2'),
   (335,'Olästa: ny medlem får inte gammal historik som oläst',newm,format(unread,'sec20_grp_a'),'0'),
   (336,'Olästa: kiosk ser inga chattar',kio,format(cnt,'chat_unread_counts() WHERE group_id LIKE ''sec20_grp_%'''),'0'),
   -- Klienten kan inte skriva
   (340,'Medlem kan inte INSERT direkt',ideA,format(ins,'sec20_grp_a',ideA,'hack',gen_random_uuid()::text,'NULL'),'ERROR'),
   (341,'Admin kan inte INSERT direkt',fadA,format(ins,'sec20_grp_a',fadA,'hack',gen_random_uuid()::text,'NULL'),'ERROR'),
   (342,'Medlem kan inte UPDATE eget meddelande direkt',ideA,format(upd,$s$body='hackad'$s$,m1),'ERROR'),
   (343,'Medlem kan inte DELETE eget meddelande direkt',ideA,format($q$WITH u AS (DELETE FROM chat_messages WHERE id = %s RETURNING 1) SELECT count(*)::text FROM u$q$,m1),'ERROR'),
   (344,'Medlem kan inte skriva läsmarkering direkt',ideA,format($q$WITH u AS (INSERT INTO chat_reads (profile_id, group_id, last_read_message_id) VALUES (%L, 'sec20_grp_b', 1) RETURNING 1) SELECT count(*)::text FROM u$q$,ideA),'ERROR'),
   (345,'Medlem kan inte arkivera chatten',ideA,$q$WITH u AS (UPDATE group_chats SET archived_at = now() WHERE group_id = 'sec20_grp_a' RETURNING 1) SELECT count(*)::text FROM u$q$,'ERROR'),
   (346,'Medlem ser bara sin egen läsmarkering',ideA,format(cnt,'chat_reads WHERE group_id LIKE ''sec20_grp_%'''),'1'),
   (347,'Medlem ser bara sina chattar i group_chats',ideA,format(cnt,'group_chats WHERE group_id LIKE ''sec20_grp_%'''),'1'),
   (348,'Superadmin ser inga chattar i group_chats',sup,format(cnt,'group_chats WHERE group_id LIKE ''sec20_grp_%'''),'0'),
   -- Triggern som skyddar meddelanden (kör som server, gäller även service role)
   (350,'Ändra group_id nekas','postgres',format(upd,$s$group_id='sec20_grp_b'$s$,m1),'ERROR'),
   (351,'Ändra author_id till annan person nekas','postgres',format(upd,format('author_id=%L',ideB),m1),'ERROR'),
   (352,'Ändra created_at nekas','postgres',format(upd,$s$created_at=now()$s$,m1),'ERROR'),
   (353,'Ändra client_id nekas','postgres',format(upd,$s$client_id=gen_random_uuid()$s$,m1),'ERROR'),
   (354,'Fästa meddelande nekas i PR 1','postgres',format(upd,$s$pinned_at=now()$s$,m1),'ERROR'),
   (355,'Ändra reply_to_id nekas','postgres',format(upd,format('reply_to_id=%s',m2),m1),'ERROR'),
   (356,'Ändra texten tillåts','postgres',format(upd,$s$body='Säk20-A1 ändrad'$s$,m1),'1'),
   (357,'Ändrad text får edited_at','postgres',format($q$SELECT (edited_at IS NOT NULL)::text FROM chat_messages WHERE id = %s$q$,m1),'true'),
   (358,'Mjuk radering tillåts','postgres',format(upd,$s$deleted_at = now(), body = 'läcker'$s$,m2),'1'),
   (359,'Mjuk radering tömmer texten','postgres',format($q$SELECT (body = '' AND deleted_at IS NOT NULL)::text FROM chat_messages WHERE id = %s$q$,m2),'true'),
   (360,'Borttaget meddelande kan inte återställas','postgres',format(upd,$s$deleted_at = NULL, body = 'tillbaka'$s$,m2),'ERROR'),
   (361,'Borttaget meddelande kan inte få ny text','postgres',format(upd,$s$body = 'ny'$s$,m2),'ERROR'),
   -- Idempotens och regler på raden
   (362,'Samma client_id två gånger ger fel (unikt)','postgres',format(ins,'sec20_grp_a',ideA,'dubblett',c1,'NULL'),'ERROR'),
   (363,'Samma client_id med ON CONFLICT ger ingen ny rad','postgres',format(insnc,'sec20_grp_a',ideA,c1),'0'),
   (364,'Det finns exakt ett meddelande för client_id','postgres',format($q$SELECT count(*)::text FROM chat_messages WHERE author_id = %L AND client_id = %L$q$,ideA,c1),'1'),
   (365,'Samma client_id hos annan person är inget problem','postgres',format(ins,'sec20_grp_a',multi,'annan person',c1,'NULL'),'1'),
   (366,'Text över 4000 tecken nekas','postgres',format(ins,'sec20_grp_a',ideA,repeat('x',4001),gen_random_uuid()::text,'NULL'),'ERROR'),
   (367,'Exakt 4000 tecken tillåts','postgres',format(ins,'sec20_grp_a',ideA,repeat('x',4000),gen_random_uuid()::text,'NULL'),'1'),
   (368,'Tom text nekas','postgres',format(ins,'sec20_grp_a',ideA,'   ',gen_random_uuid()::text,'NULL'),'ERROR'),
   (369,'Svar på meddelande i annan grupp nekas','postgres',format(ins,'sec20_grp_b',ideB,'svar',gen_random_uuid()::text,m1::text),'ERROR'),
   (370,'Svar i samma grupp tillåts','postgres',format(ins,'sec20_grp_a',ideA,'svar',gen_random_uuid()::text,m1::text),'1'),
   (371,'Senaste meddelandet i chatten uppdateras','postgres',$q$SELECT (last_message_id = (SELECT max(id) FROM chat_messages WHERE group_id = 'sec20_grp_a'))::text FROM group_chats WHERE group_id = 'sec20_grp_a'$q$,'true'),
   (372,'Ny grupp fick automatiskt en chatt','postgres',$q$SELECT count(*)::text FROM group_chats WHERE group_id IN ('sec20_grp_a','sec20_grp_b','sec20_grp_common')$q$,'3'),
   -- Arkiverad chatt
   (380,'Arkivera chatten','postgres',$q$WITH u AS (UPDATE group_chats SET archived_at = now() WHERE group_id = 'sec20_grp_a' RETURNING 1) SELECT count(*)::text FROM u$q$,'1'),
   (381,'Arkiverad chatt: kan inte posta',ideA,$q$SELECT public.can_post_in_group_chat('sec20_grp_a')::text$q$,'false'),
   (382,'Arkiverad chatt: är fortfarande medlem',ideA,$q$SELECT public.is_group_chat_member('sec20_grp_a')::text$q$,'true'),
   (383,'Arkiverad chatt: kan fortfarande läsa',ideA,format(rd,m1),'1'),
   (384,'Avarkivera chatten','postgres',$q$WITH u AS (UPDATE group_chats SET archived_at = NULL WHERE group_id = 'sec20_grp_a' RETURNING 1) SELECT count(*)::text FROM u$q$,'1'),
   (385,'Avarkiverad chatt: kan posta igen',ideA,$q$SELECT public.can_post_in_group_chat('sec20_grp_a')::text$q$,'true'),
   -- Städning av läsmarkeringar
   (390,'Läsmarkering försvinner när personen tas bort ur gruppen','postgres',format($q$SELECT count(*)::text FROM chat_reads WHERE profile_id = %L$q$,removed),'0'),
   (391,'Läsmarkering försvinner när medlemskapet blir inaktivt','postgres',format($q$SELECT count(*)::text FROM chat_reads WHERE profile_id = %L$q$,inact),'0'),
   (392,'Läsmarkering för kvarvarande medlem finns kvar','postgres',format($q$SELECT count(*)::text FROM chat_reads WHERE profile_id = %L$q$,ideA),'1'),
   -- Kontoradering: författaren försvinner men databasen tillåter det trots skyddet
   (395,'Radera konto med chattmeddelande fungerar','postgres',format($q$WITH d AS (DELETE FROM auth.users WHERE id = %L RETURNING 1) SELECT count(*)::text FROM d$q$,gdpr),'1'),
   (396,'Meddelandet finns kvar utan författare','postgres',$q$SELECT count(*)::text FROM chat_messages WHERE body = 'Säk20-gdpr' AND author_id IS NULL$q$,'1')
  ) AS v(n,test,who,sql,expected) ORDER BY n LOOP
    IF t.who = 'postgres' THEN
      PERFORM set_config('role','postgres', true);
    ELSIF t.who IS NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
      PERFORM set_config('role','anon', true);
    ELSE
      PERFORM set_config('request.jwt.claims', json_build_object('sub',t.who,'role','authenticated')::text, true);
      PERFORM set_config('role','authenticated', true);
    END IF;
    BEGIN
      EXECUTE t.sql INTO res;
    EXCEPTION WHEN others THEN
      res := 'ERROR';
    END;
    PERFORM set_config('role','postgres', true);
    results := results || array[[t.n::text, t.test, t.expected, res]];
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO sec_test.results20
  SELECT results[i][1]::int, results[i][2], results[i][3], results[i][4] FROM generate_subscripts(results,1) i;
END $$;

-- Städa upp testdata från körningen
DELETE FROM groups WHERE id LIKE 'sec20_grp_%';
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-00000000a011','00000000-0000-0000-0000-00000000a012','00000000-0000-0000-0000-00000000a013',
  '00000000-0000-0000-0000-00000000a014','00000000-0000-0000-0000-00000000a015','00000000-0000-0000-0000-00000000a016',
  '00000000-0000-0000-0000-00000000a017');

SELECT n, test, expected, got, CASE WHEN expected = got THEN 'OK' ELSE 'FEL' END AS status
FROM sec_test.results20 ORDER BY n;
