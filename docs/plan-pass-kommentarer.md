# Plan: kommentarer på pass

Godkänd av Isak 2026-09-29. Bygger ut den befintliga tråden "Frågor och svar" (tabellen `pass_messages`).

## Beslut

- Bygg ut befintlig tråd, ingen ny separat funktion.
- Läsa och skriva: bokade ideella, ansvariga för passet, vaktmästaren (`passes.vk_profile_id`), admin i församlingen (inom sitt område). Inte ideella som inte är bokade, inte kiosk.
- Svar i tråd, en svarsnivå.
- @nämna: alla som har åtkomst till passet, även andra bokade ideella (bara namn visas, aldrig mail eller telefon).
- Redigera egen kommentar hur länge som helst, markeras "redigerad".
- Ta bort egen kommentar. Admin kan ta bort alla inom sitt område. Borttagen kommentar med svar visas som "Kommentaren är borttagen".
- Notis i appen vid ny kommentar. Mail bara när man @nämns eller får svar på sin kommentar, högst ett mail per person och pass per 30 minuter. Mailet innehåller inte kommentarens text. Kan stängas av på profilsidan (`notif_settings.kommentar_mail`).
- Ansvariga och vaktmästare får inte mail vid varje ny fråga, bara notis i appen.
- Märket "Personal" räknas fram i API:t (ansvarig, vaktmästare, admin för passet eller anställd). Kolumnen `is_staff_reply` behålls men används inte.

## Datamodell (migration 018, idempotent, bara tillägg)

- `pass_messages`: `parent_id` (en nivå, samma pass), `edited_at`, `deleted_at`, max 2000 tecken.
- `pass_message_mentions (message_id, profile_id)`.
- `can_access_pass_thread(pass_id)`: bokad, ansvarig, vaktmästare eller `can_admin_pass`.
- Trigger som låser allt utom `body` och `deleted_at` vid uppdatering.
- `notifications`: `pass_id`, `comment_id`, `emailed_at`, typerna `comment`, `comment_reply`, `comment_mention`.
- `notif_settings.kommentar_mail` (standard true).

## Samordning med ChatGPT

ChatGPT ändrar `PassDetailModal.tsx`, notissidan, passkorten, datumformat och tomlägen. Den här funktionen rör inte de filerna. Notiser får `pass_id` och `comment_id` i databasen; länken på notissidan görs av ChatGPT.

## Rättas på vägen

Dagens kod skickar notis med förhandsvisning av frågan till alla pastoratsadmins och superadmins i hela systemet. Mottagarna begränsas till de som har åtkomst till passet.
