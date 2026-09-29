# Testmiljön

## Översikt

- **Produktion:** https://www.kyrkouppdrag.se, gren `main`, databas `xfjizomwxcavkuvweqfx`
- **Test:** https://test.kyrkouppdrag.se, gren `staging`, databas `waexfsgudzzbmaoqnnte` (kyrkans-uppdragsapp-test)

Testdatabasen innehåller bara påhittade uppgifter: Test pastorat, Test Församling A och B, Testkyrkan, Testkapellet och Provkyrkan.

## Miljövariabler för grenen `staging` i Vercel

Sätts i Vercel under Settings > Environment Variables, miljö **Preview**, gren **staging**:

| Variabel | Värde |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://waexfsgudzzbmaoqnnte.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | anon-nyckeln från testprojektet |
| SUPABASE_SERVICE_ROLE_KEY | service role-nyckeln från testprojektet (Supabase > Project Settings > API Keys) |
| NEXT_PUBLIC_APP_URL | https://test.kyrkouppdrag.se |
| TEST_MODE | true |
| TEST_SUPERADMIN_EMAIL | isakfolcker+superadmin@gmail.com |
| EMAIL_ALLOWLIST | isakfolcker@gmail.com |
| BREVO_FROM_NAME | Kyrkans uppdragsapp (TEST) |

## Första gången: skapa testkonton

1. Kör `curl -X POST https://test.kyrkouppdrag.se/api/test/bootstrap`. Ett superadminkonto skapas och ett inbjudningsmail går till `isakfolcker+superadmin@gmail.com` (hamnar i din vanliga Gmail).
2. Logga in och bjud in ett testkonto per nivå via appen, alla till plus-adresser:
   - `isakfolcker+ideell@gmail.com` (ideell, Test Församling A)
   - `isakfolcker+anstalld@gmail.com` (anställd, Test Församling A)
   - `isakfolcker+fadmin@gmail.com` (församlingsadmin, Test Församling A)
   - `isakfolcker+padmin@gmail.com` (pastoratsadmin)
   - `isakfolcker+ideellb@gmail.com` (ideell, Test Församling B, för att testa att församlingar inte ser varandra)
3. Nollställ testpassen när du vill: logga in som admin och kör `POST /api/test/reset-data`.

## Databasändringar

1. Ny fil i `supabase/migrations/`, nästa nummer.
2. Körs mot testdatabasen först.
3. Efter godkänd test och granskning körs samma fil mot produktion.

## Kända saker att åtgärda (backlog)

- 133 gamla lintfel. Lint visas i GitHub men stoppar inte ännu.
- `next.config.ts` har `ignoreBuildErrors: true`. Typkontrollen går nu igenom utan fel, så den kan tas bort.
- Integritetspolicyn säger att data lagras i Frankfurt (eu-central-1), men databasen ligger i Irland (eu-west-1). Texten behöver rättas.
- Skydd mot läckta lösenord är avstängt i Supabase Auth (produktion).
- Behörighetsfunktionerna går att anropa utan inloggning (låg risk, de returnerar inget för oinloggade). Rättas med en migration som testas noga först.
- Repot är publikt på GitHub. Överväg att göra det privat.
- Många gamla grenar (`claude/*`, `fix/*`) kan städas bort efter genomgång.
