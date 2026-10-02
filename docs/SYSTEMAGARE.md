# Systemägare och organisationsval

Den högsta nivån, Superadmin, tillhör en enda systemägare. Vanlig rollhantering
kan ge pastoratsadmin, församlingsadmin och personalroller men inte systemägarskap.
Databasens ägarpost styr API:er och RLS; gamla `super`-flaggor ger inte global åtkomst.
Äldre supermedlemskap behåller administratörsåtkomst i sina församlingar/pastorat.

## Installation

1. Verifiera ändringen i TESTMILJO.md:s testprojekt först. Migration 019 måste redan
   vara installerad. Kör 020 först om grupphanteringen också ska installeras.
2. Kör `supabase/migrations/021_systemagare.sql`. Ägartabellen är initialt tom:
   ingen användare får systemåtkomst förrän servern har registrerat ägaren.
3. Sätt `SYSTEM_OWNER_EMAIL` i servermiljön till ägarens verifierade inloggningsadress.
   Adressen ska inte finnas i Git eller i en `NEXT_PUBLIC_`-variabel. Servern behöver
   även befintlig `SUPABASE_SERVICE_ROLE_KEY` och Supabase URL/anon key.
4. Driftsätt koden tillsammans med migrationen. Logga in med det avsedda kontot
   vars e-post är verifierad av Supabase. Vid första begäran binds dess profil-ID
   atomiskt och permanent till den enda ägarposten. Profilen måste finnas.
5. Kontrollera märkningen ”Superadmin · Systemägare” i organisationsfältet och
   systemöversikten. Prova med ett annat konto att systemnivån inte är tillgänglig,
   att den inte kan tilldelas och att församlingsbyten respekterar medlemskap.

När posten har skapats behålls ägarskapet om inloggningsadressen ändras. En ändring
av `SYSTEM_OWNER_EMAIL` flyttar aldrig ägarskapet till ett annat konto. Ägarposten
kan inte skrivas av vanliga användare eller direkt av service-role-klienten;
registrering går endast via serverns RPC. Ett eventuellt framtida ägarbyte kräver
en avsiktlig databasadministration med separat kontroll. Konto-/personradering
skyddas av API-kontroller och en främmande nyckel som hindrar borttagning av ägarprofilen.

## Aktiv organisation

Överst visas vald församling, dess pastorat och den effektiva rollen på dator och
mobil, även om kontot bara har en församling. För flera organisationer finns val
för församling och pastorat. Ett pastoratsbyte väljer den första tillgängliga
församlingen där; pass och personal filtreras fortfarande till en församling.
Översiktssidor anger sitt bredare sammanhang. Valen innehåller bara organisationer
som användaren har tillgång till. Byte stänger öppna modaler och återställer gruppfilter.

## Verifiering

`npm run check` kör typkontroll och enhetstester, inklusive ägaridentifiering,
nekad rolltilldelning, skydd av ägarprofilen, konto-radering och organisationsval.

Databastestet kräver en separat installation av `@electric-sql/pglite` (validerat
med 0.5.8). Kör `PGLITE_MODULE_PATH=/sökväg/till/installationen node tests/integration/systemOwner.mjs`.
Det skapar en lokal temporär databas och verifierar ägarregistrering, åtkomsträttigheter,
gamla rollflaggor, organisationsgränser, raderingsskydd och omkörning av migrationen.
Det använder inga riktiga konton, ingen extern databas och ingen e-post.

Lokala tester ersätter inte verifiering av befintliga RLS-policyer i testprojektet.
Molnmiljön saknade Supabase-nycklar vid utvecklingen. Hela Next-bygget var också
blockerat av hämtningen av Google Fonts; isolerade komponenttester på dator/mobil
passerade med systemtypsnitt. Inga externa migrationer eller driftsättningar har gjorts.
