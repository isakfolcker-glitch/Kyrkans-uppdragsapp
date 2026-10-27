-- Testdata för TESTMILJÖN. Kör aldrig mot produktion.
-- Innehåller bara påhittade uppgifter. Testkonton skapas via /api/test/bootstrap
-- och appens vanliga inbjudningsflöde, och testpass via /api/test/reset-data.

DO $$
BEGIN
  IF current_database() = 'postgres' AND EXISTS (
    SELECT 1 FROM public.profiles WHERE email ILIKE '%@svenskakyrkan.se' AND email NOT ILIKE '%+test%'
  ) THEN
    RAISE EXCEPTION 'Databasen innehåller riktiga konton. Seed avbruten, detta ser ut som produktion.';
  END IF;
END $$;

INSERT INTO pastorat (name)
SELECT 'Test pastorat'
WHERE NOT EXISTS (SELECT 1 FROM pastorat WHERE name = 'Test pastorat');

INSERT INTO churches (name, admin_name, tel, address, pastorat_id)
SELECT v.name, v.admin_name, v.tel, v.address, (SELECT id FROM pastorat WHERE name = 'Test pastorat')
FROM (VALUES
  ('Test Församling A', 'Anna Testsson', '070-000 00 01', 'Testgatan 1, 351 00 Växjö'),
  ('Test Församling B', 'Bertil Provsson', '070-000 00 02', 'Provvägen 2, 351 00 Växjö')
) AS v(name, admin_name, tel, address)
WHERE NOT EXISTS (SELECT 1 FROM churches c WHERE c.name = v.name);

INSERT INTO kyrkor (forsamling_id, name)
SELECT c.id, k.name
FROM churches c
JOIN (VALUES
  ('Test Församling A', 'Testkyrkan'),
  ('Test Församling A', 'Testkapellet'),
  ('Test Församling B', 'Provkyrkan')
) AS k(church, name) ON k.church = c.name
WHERE NOT EXISTS (SELECT 1 FROM kyrkor x WHERE x.forsamling_id = c.id AND x.name = k.name);

-- =====================================================================
-- Migration 022: ett andra pastorat med egna församlingar och kyrkor, så att
-- behörighetstester kan kontrollera att åtkomst inte läcker mellan pastorat.
-- "Test pastorat" ovan räknas som pastorat 1 i testplanen.
-- =====================================================================

INSERT INTO pastorat (name)
SELECT 'Test pastorat 2'
WHERE NOT EXISTS (SELECT 1 FROM pastorat WHERE name = 'Test pastorat 2');

INSERT INTO churches (name, admin_name, tel, address, pastorat_id)
SELECT v.name, v.admin_name, v.tel, v.address, (SELECT id FROM pastorat WHERE name = 'Test pastorat 2')
FROM (VALUES
  ('Test Församling C', 'Cecilia Testsson', '070-000 00 03', 'Testbacken 3, 351 00 Växjö'),
  ('Test Församling D', 'David Provsson', '070-000 00 04', 'Provbacken 4, 351 00 Växjö')
) AS v(name, admin_name, tel, address)
WHERE NOT EXISTS (SELECT 1 FROM churches c WHERE c.name = v.name);

INSERT INTO kyrkor (forsamling_id, name)
SELECT c.id, k.name
FROM churches c
JOIN (VALUES
  ('Test Församling C', 'Testkyrkan C'),
  ('Test Församling D', 'Provkyrkan D')
) AS k(church, name) ON k.church = c.name
WHERE NOT EXISTS (SELECT 1 FROM kyrkor x WHERE x.forsamling_id = c.id AND x.name = k.name);

-- =====================================================================
-- Migration 022: testpersoner med medlemskap i flera organisationer, så att
-- man kan testa att behörighet från ett medlemskap aldrig läcker till ett
-- annat. Konton skapas direkt i auth.users (samma teknik som
-- supabase/tests/behorighet.sql) eftersom de bara används för SQL- och
-- RLS-tester, inte för inloggning i webbläsaren.
--   M: pastoratsadmin i Test pastorat (1) OCH ideell i Test Församling C.
--   N: fadmin i Test Församling A OCH ideell i Test Församling B.
--   O: anställd i Test Församling A (alla behörighetsbockar) OCH ideell i
--      Test Församling C.
-- =====================================================================

DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT * FROM (VALUES
    ('00000000-0000-0000-0000-00000000b001'::uuid,'test-m@test.invalid','Test M Pastoratsadmin'),
    ('00000000-0000-0000-0000-00000000b002'::uuid,'test-n@test.invalid','Test N Fadmin'),
    ('00000000-0000-0000-0000-00000000b003'::uuid,'test-o@test.invalid','Test O Anstalld')
  ) AS t(id,email,name) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (u.id, '00000000-0000-0000-0000-000000000000','authenticated','authenticated',u.email,'',now(),
            jsonb_build_object('name',u.name),'{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- M: pastoratsadmin i Test pastorat (1), via den nya pastorat_memberships-tabellen.
INSERT INTO pastorat_memberships (profile_id, pastorat_id, role, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000b001', id, 'padmin', true, now()
FROM pastorat WHERE name = 'Test pastorat'
ON CONFLICT (profile_id, pastorat_id) DO UPDATE SET active = true, accepted_at = now();

-- M: ideell i Test Församling C.
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000b001', id, 'ideell', 'none', false, true, now()
FROM churches WHERE name = 'Test Församling C'
ON CONFLICT (profile_id, church_id) DO UPDATE SET active = true, accepted_at = now();

-- N: fadmin i Test Församling A.
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000b002', id, 'fadmin', 'forsamling', true, true, now()
FROM churches WHERE name = 'Test Församling A'
ON CONFLICT (profile_id, church_id) DO UPDATE SET role = 'fadmin', admin_level = 'forsamling', is_employee = true, active = true, accepted_at = now();

-- N: ideell i Test Församling B.
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000b002', id, 'ideell', 'none', false, true, now()
FROM churches WHERE name = 'Test Församling B'
ON CONFLICT (profile_id, church_id) DO UPDATE SET active = true, accepted_at = now();

-- O: anställd i Test Församling A med alla behörighetsbockar.
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000b003', id, 'anstalld', 'none', true, true, now()
FROM churches WHERE name = 'Test Församling A'
ON CONFLICT (profile_id, church_id) DO UPDATE SET role = 'anstalld', admin_level = 'none', is_employee = true, active = true, accepted_at = now();

INSERT INTO profile_church_permissions (
  profile_id, church_id,
  kan_skapa_pass, kan_redigera_pass, kan_se_bokningar, kan_hantera_bokningar,
  kan_se_personal, kan_lagg_till_personal, kan_hantera_grupper, kan_skicka_utskick
)
SELECT '00000000-0000-0000-0000-00000000b003', id, true, true, true, true, true, true, true, true
FROM churches WHERE name = 'Test Församling A'
ON CONFLICT (profile_id, church_id) DO UPDATE SET
  kan_skapa_pass = true, kan_redigera_pass = true, kan_se_bokningar = true, kan_hantera_bokningar = true,
  kan_se_personal = true, kan_lagg_till_personal = true, kan_hantera_grupper = true, kan_skicka_utskick = true;

-- O: ideell i Test Församling C.
INSERT INTO profile_churches (profile_id, church_id, role, admin_level, is_employee, active, accepted_at)
SELECT '00000000-0000-0000-0000-00000000b003', id, 'ideell', 'none', false, true, now()
FROM churches WHERE name = 'Test Församling C'
ON CONFLICT (profile_id, church_id) DO UPDATE SET active = true, accepted_at = now();
