# Instruktion till kyrkouppdrag.se

Appen samordnar ideella och anställda i Svenska kyrkan Växjö. Här får du veta vad varje roll kan göra.

Webb: https://www.kyrkouppdrag.se
Prova utan konto: https://www.kyrkouppdrag.se/demo
Testmiljö: https://test.kyrkouppdrag.se

Utgåva: 29 oktober 2026. Bilderna i PDF:en visar påhittade personer i det lokala demot. Appens meny följer din roll i vald församling. Anställda kan få olika behörigheter i olika församlingar.

## 1. Komma igång

**Logga in.** Gå till https://www.kyrkouppdrag.se/login och skriv e-post och lösenord. Har du glömt lösenordet väljer du "Glömt lösenord" och följer länken i mejlet.

**Bli inbjuden.** En administratör eller behörig anställd bjuder in dig via e-post. Klicka på länken i mejlet, välj lösenord och godkänn integritetspolicyn. Om du är medlem i flera församlingar visas inbjudningarna när du loggar in. Du väljer själv att acceptera eller avböja.

**Välja församling.** Tillhör du flera församlingar byter du i menyn. Det du ser och får göra gäller alltid den valda församlingen.

**Demoläge.** På https://www.kyrkouppdrag.se/demo väljer du en av sex roller och provar appen. Om du får en lösenordsfråga ber du den som visar demot om demolösenordet. Ändringar gäller bara under visningen och försvinner när demot startas om. Inga riktiga mejl skickas. Du byter roll längst ned i menyn eller under Mer på mobilen. Avsluta demo tar dig tillbaka till rollvalet. I kiosken heter knappen Lämna kioskläget.

I demot kan vissa funktioner visa "Fungerar inte i demot", till exempel åtgärder som gäller ett riktigt konto. Ett riktigt konto i samma webbläsare påverkas inte.

## 2. Roller i korthet

| Roll | Kort beskrivning |
|---|---|
| Ideell | Bokar pass och ser sina bokningar |
| Anställd | Som ideell, plus ansvar för pass. Får extra funktioner efter vilka behörigheter admin ger |
| Församlingsadmin | Styr allt i sin församling |
| Pastoratsadmin | Styr alla församlingar i sitt pastorat och kan utse församlingsadmin |
| Superadmin | Ser och styr hela systemet, alla pastorat |
| Kiosk | Surfplatta i kyrkan där besökare skriver upp sig. Ser bara kiosksidan |

## 3. Menyn per roll

| Menyval | Ideell | Anställd | Förs.admin | Pastorat.admin | Superadmin | Kiosk |
|---|---|---|---|---|---|---|
| Start | ja | ja | ja | ja | ja | |
| Pastorat | | | | | ja | |
| Pass | ja | ja | ja | ja | ja | |
| Mina ansvar | | ja | | | | |
| Personal | | behörighet | ja | ja | ja | |
| Grupper | | behörighet | ja | ja | ja | |
| Utskick | | behörighet | ja | ja | ja | |
| Behörigheter | | | ja | ja | ja | |
| Församlingar | | | | ja | ja | |
| Exportera | | | ja | ja | ja | |
| Mina bokningar | ja | ja | ja | ja | | |
| Notiser | ja | ja | ja | ja | | |
| Min profil | ja | ja | ja | ja | ja | |
| Kiosk | | | | | | ja |

"Behörighet" betyder att menyvalet visas när en administratör har gett den anställda rättigheten i vald församling. Exportera innehåller både import och export.

## 4. Funktioner steg för steg

### Start
Hälsning och översikt över vad som är viktigt för dig just nu, till exempel kommande pass.

### Pass (alla)
Här ser du alla pass i den valda församlingen. Filtrera på grupp för att hitta det som passar dig.

**Boka ett pass (ideell, anställd):**
1. Klicka på ett pass för att öppna det.
2. Läs tid, plats och beskrivning.
3. Tryck "Boka".

**Är passet fullt** kan du ställa dig på väntelistan. Blir en plats ledig får du besked.

**Avboka.** Du kan avboka själv fram till 24 timmar före start. Är det kortare tid kvar kontaktar du den som är ansvarig.

**Fråga om ett pass.** I passet finns frågor och kommentarer. Skriv en fråga, och använd @ för att nämna en person.

### Mina bokningar
Lista över dina kommande och tidigare pass. Härifrån kan du öppna passet eller avboka.

### Mina ansvar (anställd)
Pass där du är utsedd som ansvarig. Där kan du se vilka som är bokade, lägga till eller ta bort personer och skicka meddelande till de bokade.

### Notiser
Meddelanden från appen, till exempel påminnelser om pass. Du kan markera notiser som lästa, en i taget eller alla samtidigt.

### Min profil
Ändra dina uppgifter, välj vilka mejl och notiser du vill ha, byt lösenord. Du kan också hämta ut dina uppgifter eller radera ditt konto (GDPR). Radering kan inte ångras.

### Skapa och ändra pass (admin eller anställd med behörighet)
1. Öppna "Pass" och välj att skapa nytt pass.
2. Fyll i titel, datum, tid, plats, antal platser, grupp och ansvarig.
3. Spara. Passet publiceras direkt eller när du väljer att publicera.
4. Öppna ett pass för att redigera, ställa in (avboka) eller ta bort det.
5. Lägg till bokningar manuellt via "Tilldela manuellt".
6. Skicka meddelande till alla bokade via "Skicka till bokade".

### Personal
Lista över personer i församlingen med roll. Här bjuder du in nya ideella med namn, e-post och grupp. Du kan också ändra uppgifter och ta bort personer.

### Grupper
Skapa och ta bort grupper, till exempel "Kyrkvärd" eller "Musik". Grupperna används för att filtrera pass och för utskick.

### Utskick
Skicka ett meddelande till hela församlingen eller en grupp. I demot visas utskicket lokalt och inget mejl skickas. I testmiljön går mejl bara till godkända testadresser.

### Behörigheter
Här styr admin vad anställda får göra. Varje behörighet slås på eller av per person:
- Skapa pass
- Redigera och ställa in pass
- Se bokningar
- Hantera bokningar
- Se personal
- Bjuda in ideella
- Hantera grupper
- Skicka utskick

Församlingsadmin kan göra någon till församlingsadmin. Pastoratsadmin kan göra någon till pastoratsadmin eller församlingsadmin.

### Församlingar (pastoratsadmin, superadmin)
Lägg till, ändra och ta bort församlingar och deras kyrkor inom pastoratet.

### Pastorat (superadmin)
Lista över alla pastorat i systemet. Lägg till, ändra och ta bort pastorat.

### Exportera (import och export)
- **Importera:** ladda upp en CSV-fil med kolumnerna namn, epost, roll, grupp. Du kan hämta en mall i appen. Du kan också lägga in personer en och en.
- **Exportera:** hämta data som CSV-fil.

### Kiosk
Visas på en surfplatta i kyrkan. Besökare skriver upp sig på lediga pass med namn och eventuella kontaktuppgifter. Kioskkontot ser bara kiosksidan. I demot kan du lämna kiosken med Lämna kioskläget. Använd bara påhittade kontaktuppgifter när du provar.

## 5. Automatiska mejl
Dagen före ett pass skickas en påminnelse till de bokade. Ansvarig anställd får en deltagarlista.

## 6. Vad varje roll inte kan
- Ideella kan inte skapa pass, se andras bokningar eller se personallistan.
- Anställda kan bara det admin har gett dem behörighet till.
- Församlingsadmin styr bara sin egen församling.
- Pastoratsadmin styr bara sitt eget pastorat.
- Kiosk kan bara använda kiosksidan.

## 7. Vanliga frågor
**Jag ser inga pass.** Kontrollera att rätt församling är vald i menyn.

**Jag kan inte avboka.** Det är mindre än 24 timmar kvar. Kontakta ansvarig.

**Jag får inga mejl.** Kolla skräppost och dina notisinställningar i Min profil.

**Jag saknar ett menyval.** Menyn följer din roll och dina behörigheter. Be en admin om behörighet.

**Varför går det inte att byta lösenord eller radera konto i demot?** Demot är frikopplat från riktiga konton. Sådana åtgärder gör du i appen när du är inloggad på ditt eget konto.

**Hur lämnar jag kiosken i demot?** Tryck Lämna kioskläget längst upp. Då visas rollvalet igen.

## 8. Mobilen

De vanligaste menyvalen finns längst ned. Tryck Mer för att se resten av menyn. Där hittar du också församlingsval och rollbyte i demot. Kiosk har en egen vy för anmälan.
