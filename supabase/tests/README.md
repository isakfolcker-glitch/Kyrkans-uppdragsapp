# Behörighetstester för databasen

`behorighet.sql` loggar in som testkonton på varje nivå (ideell, församlingsadmin A och B,
pastoratsadmin, superadmin) och försöker göra saker de inte får, t.ex. göra sig själv till
superadmin eller ändra personer i en annan församling. Varje rad i resultatet ska ha status `OK`.

Körs ENBART mot testdatabasen (kyrkans-uppdragsapp-test). Skriptet avbryter sig självt om
testförsamlingarna saknas. Kör om efter varje ändring av RLS-regler eller behörighetsfunktioner.

## Grupphantering (020), isolerade PostgreSQL-tester

`group_management_020.mjs` kör migration 020 mot en engångsdatabas i PGlite med
enbart påhittade personer och ett minimalt schema för de berörda tabellerna.
Ingen anslutning görs till Supabase. Projektets beroenden behöver inte ändras:

```bash
npm install --prefix /tmp/group-sql --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE_PATH=/tmp/group-sql node supabase/tests/group_management_020.mjs
```

Testerna kontrollerar transaktioner, församlingsgränser, ansvarigas medlemskap,
städning när medlemskap ändras eller tas bort, funktionens anropsrättigheter och
att migrationen kan köras igen och bevarar kopplingar när äldre gemensamma grupper
får egna kopior per församling. Alla 20 kontroller ska passera. Detta kompletterar
API-enhetstesterna; befintliga RLS-tester och inloggade flöden måste även verifieras
mot testprojektet före produktionssättning. Kör migration 020 efter 019 och först
mot testdatabasen. Gamla migrationsfiler ändras inte.
