# Kontroll av demoläge och användarinstruktion

Datum: 29 oktober 2026

Arbetsgren: `fix/demo-alla-roller`. Ingen ändring har slagits ihop till main. Ingen pull request har skapats.

## Genomfört

Demot har ideell, anställd, församlingsadmin, pastoratsadmin, superadmin och kiosk. Lokala exempel omfattar två pastorat och tre församlingar. Exempeladresser använder example.com. Behörigheter följer vald församling och ansvariga personer på passen.

Demots store har `isDemo: true`, appens vanliga store har `isDemo: false`. Vanlig dataladdning monteras inte runt demosidorna. Demovägar hanteras före Supabase i proxy. Direkta anrop i sidor, dialoger och kommentarer använder lokala funktioner eller stoppas innan servern kontaktas. Känsliga funktioner visar "Fungerar inte i demot". Ingen databasändring eller migration ingår.

## Lokala kontroller

Appen startades på `http://localhost:3100` med följande dummyvärden:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
DEMO_PASSWORD=lokaltest
```

Detta är lokala testvärden, inte uppgifter till någon driftsmiljö.

Playwright: 28 av 28 fall godkända på dator och mobil. Testerna kontrollerar alla sex roller, varje menyval, tillåtna menyval, församlingsbyte, Mina ansvar, kiosk, lokala grupper, utskick, pastorat och adminmedlemskap. Profil, lösenord, radering, policyknapp, påminnelser och inbjudningar provas med fiktiva lagrade sessionsuppgifter. Inga riktiga konton eller produktionsuppgifter används.

Testerna registrerar och stoppar alla API anrop utom `/api/demo/auth` och all extern trafik från webbläsaren. En otillåten begäran gör testet underkänt, även om begäran stoppas. Inga sådana begäranden observerades.

Typkontroll och 171 enhetstester är godkända med `npm run check`, som körs före varje commit. Tretton separata tester monterar den verkliga appens provider och verifierar att sena svar, pågående dataladdning, notiskanal och bakgrundsförnyelse av inloggningen inte fortsätter när demot öppnas. Både vanlig montering, React StrictMode, sen initiering och dold flik ingår. Testberoendet jsdom används för riktig Reactmontering.

Lint kördes separat och rapporterar 135 problem, varav 108 fel och 27 varningar. Repots äldre lintfel finns kvar. Jämförelse mot utgångskoden visar inga nya fel i de ändrade filerna. De nya testfilerna och bildskriptet är godkända i lint. `npm run check` omfattar i detta repo typkontroll och enhetstester, inte lint.

## Säkerhet och granskning

Säkerhetsgranskningen är godkänd för slutlig kod. Granskningen fann en vanlig policylänk som kunde öppna appens riktiga dataläsning. Demot använder nu en lokal knapp utan länkadress. Slutgranskningen fann även felaktigt församlingsurval i Exportera, adminmedlemskap som kunde tilldelas fel pastorat och kvarvarande bakgrundsarbete vid byte till demo. Dessa är rättade och har regressionstester. Riktiga konton loggas inte ut och andra flikar påverkas inte.

## Bilder och instruktion

88 skärmbilder täcker alla 44 roll och menyvalskombinationer på dator och mobil. Bilderna är 1280 gånger 800 respektive 390 gånger 844 bildpunkter. `docs/screenshots/demo/manifest.json` beskriver varje bild.

PDF:en har 21 sidor. Samtliga sidor har renderats som bilder och granskats. Rubriker och bilder hålls ihop och ingen dokumenttext är avklippt. Den tidigare instruktionen på `claude/youthful-dijkstra-ddn04l` användes som underlag utan att den grenen ändrades.

Återskapa bilder med `node scripts/capture-demo.mjs` mot den lokala appen och därefter PDF med `python scripts/build-user-guide.py`. PDF bygget kräver ReportLab och Arial på Windows eller DejaVu Sans på Linux.

## Återstår före slutligt godkännande

Vercel byggde den första arbetsversionen utan fel. Förhandsvisningen kräver Vercel inloggning. Test på förhandsvisningen av slutlig kod återstår tills testaren har en delningslänk eller annan av ägaren tilldelad teståtkomst.

Arbetet får inte slås ihop till main utan Isaks godkännande. Pull request skapas först när Isak ber om det.
