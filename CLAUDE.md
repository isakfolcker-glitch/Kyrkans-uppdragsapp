@AGENTS.md

# kyrkouppdrag.se

App för att samordna ideella och anställda i Svenska kyrkan Växjö. Next.js 16, Supabase, Tailwind 4, Vercel. Ägare: Isak Folcker (inte utvecklare, förklara på enkel svenska).

## Miljöer

| Miljö | Webb | Databas (Supabase) | Git-gren |
|---|---|---|---|
| Produktion | https://www.kyrkouppdrag.se | `xfjizomwxcavkuvweqfx` | `main` |
| Test | https://test.kyrkouppdrag.se | `waexfsgudzzbmaoqnnte` (kyrkans-uppdragsapp-test) | `staging` |
| Preview | automatisk URL per gren på Vercel | testdatabasen (Vercel Preview-variabler) | alla andra grenar |

Testmiljön har `TEST_MODE=true` och `EMAIL_ALLOWLIST` satta, så mail bara kan gå till godkända testadresser. Se docs/TESTMILJO.md.

## Teamet (.claude/agents/)

| Agent | Gör |
|---|---|
| arkitekt | Planerar och fördelar arbetet. Alltid först. |
| frontend | Sidor, komponenter, mobil, kioskläge, demoläge |
| backend | API, databas, migrationer, RLS, mail, cron |
| testare | Vitest och Playwright, alla fem behörighetsnivåer |
| sakerhet | Behörigheter, hemligheter, GDPR. Granskar, ändrar inte. |
| granskare | Sista grinden före main. Godkänner eller stoppar. |

## Arbetsflöde (följs alltid)

1. **arkitekt** planerar. Isak bekräftar.
2. Ny gren från `main`, t.ex. `feature/kort-beskrivning` eller `fix/kort-beskrivning`.
3. **frontend** och/eller **backend** bygger. Databasändringar som ny fil i `supabase/migrations/`, körs mot testdatabasen.
4. **testare** testar på preview-URL:en.
5. **sakerhet** granskar om ändringen rör data, API, roller eller personuppgifter.
6. **granskare** godkänner. Isak slår ihop till `main` via pull request.
7. Om det finns en ny migration: kör den mot produktion enligt granskarens instruktion.

## Hårda regler

- Aldrig commit direkt till `main`.
- Aldrig ändringar direkt i Supabase-dashboarden. Allt via migrationsfiler.
- Aldrig riktiga personuppgifter i testmiljön, tester eller kod.
- Aldrig hemligheter i koden. Repot är publikt.
- All mail via `lib/email.ts`.
- Nya funktioner i `lib/appStore.tsx` läggs även in i `lib/demoStore.tsx`.
- Kör `npm run check` före varje commit.

## Behörighetsnivåer

`role`: ideell, anstalld, fadmin, padmin, superadmin, kiosk. `admin_level`: none, forsamling, pastorat, super. Funktionerna `is_admin()`, `same_church_as()`, `can_set_admin_level()` i databasen styr RLS.

## Kommandon

- `npm run dev` lokalt (kräver `.env.local` mot testdatabasen, se `.env.example`)
- `npm run check` lint + typkontroll + enhetstester
- `PLAYWRIGHT_BASE_URL=<url> npm run test:e2e` webbläsartester
