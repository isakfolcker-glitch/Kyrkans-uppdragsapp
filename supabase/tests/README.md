# Behörighetstester för databasen

`behorighet.sql` loggar in som testkonton på varje nivå (ideell, församlingsadmin A och B,
pastoratsadmin, superadmin) och försöker göra saker de inte får, t.ex. göra sig själv till
superadmin eller ändra personer i en annan församling. Varje rad i resultatet ska ha status `OK`.

Körs ENBART mot testdatabasen (kyrkans-uppdragsapp-test). Skriptet avbryter sig självt om
testförsamlingarna saknas. Kör om efter varje ändring av RLS-regler eller behörighetsfunktioner.
