# Testmiljön

## Översikt

- **Produktion:** https://www.kyrkouppdrag.se, gren `main`, databas `xfjizomwxcavkuvweqfx`
- **Test:** https://test.kyrkouppdrag.se, gren `staging`, databas `waexfsgudzzbmaoqnnte` (kyrkans-uppdragsapp-test)

Testdatabasen innehåller bara påhittade uppgifter: Test pastorat, Test Församling A och B, Testkyrkan, Testkapellet och Provkyrkan.

## Miljövariabler för Preview i Vercel

Sätts i Vercel under Settings > Environment Variables, miljö **Preview** (alla grenar). Då kör varje preview och test.kyrkouppdrag.se mot testdatabasen, och bara `main` mot produktionen. Idag saknar Preview Supabase-variabler helt, därför misslyckas preview-byggen.

| Variabel | Värde |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | https://waexfsgudzzbmaoqnnte.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | anon-nyckeln från testprojektet |
| SUPABASE_SERVICE_ROLE_KEY | service role-nyckeln från testprojektet (Supabase > Project Settings > API Keys) |
| NEXT_PUBLIC_APP_URL | https://test.kyrkouppdrag.se |
| BREVO_API_KEY | samma som produktion (EMAIL_ALLOWLIST stoppar mail till andra än dig) |
| BREVO_FROM | samma som produktion |
| CRON_SECRET | valfri ny lång slumpsträng |
| TEST_MODE | true |
| TEST_SUPERADMIN_EMAIL | isakfolcker+superadmin@gmail.com |
| EMAIL_ALLOWLIST | isakfolcker@gmail.com |
| BREVO_FROM_NAME | Kyrkans uppdragsapp (TEST) |

## Testadressen

Vercel > Settings > Domains > Add: `test.kyrkouppdrag.se`, koppla till Git-grenen `staging`.

## Första gången: skapa testkonton

1. Kör `curl -X POST https://test.kyrkouppdrag.se/api/test/bootstrap`. Ett superadminkonto skapas och ett inbjudningsmail går till `isakfolcker+superadmin@gmail.com` (hamnar i din vanliga Gmail).
2. Logga in och bjud in ett testkonto per nivå via appen, alla till plus-adresser:
   - `isakfolcker+ideell@gmail.com` (ideell, Test Församling A)
   - `isakfolcker+anstalld@gmail.com` (anställd, Test Församling A)
   - `isakfolcker+fadmin@gmail.com` (församlingsadmin, Test Församling A)
   - `isakfolcker+padmin@gmail.com` (pastoratsadmin)
   - `isakfolcker+ideellb@gmail.com` (ideell, Test Församling B, för att testa att församlingar inte ser varandra)
3. Nollställ testpassen när du vill: logga in som admin och kör `POST /api/test/reset-data`.

## Keepalive (håller Supabase-projekten vakna)

Supabase pausar gratisprojekt automatiskt efter 7 dagars inaktivitet. För att det inte ska hända igen finns `/api/cron/keepalive` (`app/api/cron/keepalive/route.ts`), som Vercel Cron anropar en gång per dygn (06:00 UTC, se `vercel.json`). Jobbet gör bara en liten läsning (`select id from churches limit 1`) mot produktionsdatabasen, och mot testdatabasen om de två variablerna nedan är satta. Svaret innehåller aldrig riktig data, bara t.ex. `{ "ok": true, "prod": "ok", "test": "ok" }`.

Eftersom Vercel Cron bara körs i miljön Production behöver testdatabasens uppgifter läggas in där (inte i Preview), annars hoppar jobbet bara över testdelen utan fel:

| Variabel | Värde |
|---|---|
| KEEPALIVE_TEST_SUPABASE_URL | testprojektets publika URL, samma som `NEXT_PUBLIC_SUPABASE_URL` ovan: `https://waexfsgudzzbmaoqnnte.supabase.co` |
| KEEPALIVE_TEST_SUPABASE_ANON_KEY | testprojektets publika anon-nyckel (inte service role) |

Isak behöver lägga in dessa två manuellt i Vercel-dashboarden under projektets Settings > Environment Variables, miljö **Production**, eftersom hemligheter aldrig ska ligga i koden. De är anon-nycklar (samma typ som redan är publik i webbläsaren för testmiljön), men ligger ändå bara i Production för att produktionsjobbet ska kunna nå testdatabasen.

## Databasändringar

1. Ny fil i `supabase/migrations/`, nästa nummer.
2. Körs mot testdatabasen först.
3. Efter godkänd test och granskning körs samma fil mot produktion.

## Kända saker att åtgärda (backlog)

- 133 gamla lintfel. Lint visas i GitHub men stoppar inte ännu.
- `next.config.ts` har `ignoreBuildErrors: true`. Typkontrollen går igenom, så den kan tas bort.
- Två församlingar i produktionen saknar pastorat. Behöver rättas innan pastoratsadmins läggs in.
- Namn och telefon i passens vaktmästarfält och texter i passhistoriken rensas inte vid radering av konto.
- Gallring efter 12 månader enligt integritetspolicyn görs inte automatiskt.
- Repot är publikt på GitHub. Överväg att göra det privat.
- Många gamla grenar (`claude/*`, `fix/*`) kan städas bort.
