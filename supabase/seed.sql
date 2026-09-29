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
