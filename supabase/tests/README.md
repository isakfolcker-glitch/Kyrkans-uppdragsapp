# Behörighetstester för databasen

`behorighet.sql` loggar in som testkonton på varje nivå (ideell, församlingsadmin A och B,
pastoratsadmin, superadmin) och försöker göra saker de inte får, t.ex. göra sig själv till
superadmin eller ändra personer i en annan församling. Varje rad i resultatet ska ha status `OK`.

Körs ENBART mot testdatabasen (kyrkans-uppdragsapp-test). Skriptet avbryter sig självt om
testförsamlingarna saknas. Kör om efter varje ändring av RLS-regler eller behörighetsfunktioner.

`behorighet_017.sql`, `behorighet_018.sql` och `behorighet_020.sql` (gruppchatt) körs efter `behorighet.sql`. `behorighet_020.sql` skapar egna påhittade konton och grupper (`sec20_grp_*`) och städar bort dem.
