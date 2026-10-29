# Gruppchatt (PR 1: grund)

Backend för en chatt per uppdragsgrupp. Migration `020_gruppchatt_grund.sql`, API under `app/api/chat/`, kod i `lib/chat/`. Gränssnitt, svar, sökning, fästa meddelanden och notiser kommer i PR 2-4.

## Beslut

- En chatt per grupp (`groups.id` är TEXT). Skapas automatiskt för varje grupp (trigger på `groups`, och för befintliga grupper i migrationen).
- Åtkomst kräver rad i `profile_groups` OCH aktivt, accepterat medlemskap (`profile_churches.active` och `accepted_at`) i gruppens församling. Gemensam grupp (`church_id` NULL): aktivt medlemskap i någon församling.
- Kiosk nekas alltid (profilroll `kiosk` eller aktivt kioskmedlemskap).
- Ingen admingren. Varken fadmin, padmin eller superadmin läser utan att själva vara med i gruppen. Inget `isSuper`-undantag i API:t heller.
- Alla skrivningar går via API:t med service role. Klienten har bara SELECT (RLS) och rättigheterna INSERT/UPDATE/DELETE är återkallade.
- Gruppansvarig = `profile_groups.is_leader` (default false). Sätts av admin för gruppens församling, och av superadmin för gemensamma grupper.
- Ny medlem ser hela gamla historiken. Gammal historik räknas dock inte som oläst: utan läsmarkering räknas bara meddelanden efter `profile_groups.joined_at`.
- Borttagning är mjuk: texten töms och `deleted_at` sätts (som i 018). Bara eget meddelande kan ändras eller tas bort. Admin kan inte moderera i PR 1.
- Arkiverad chatt (`group_chats.archived_at`) kan läsas men inte skrivas i. Det finns inget API för att arkivera ännu.

## Tabeller

| Tabell | Innehåll |
|---|---|
| `profile_groups` (ändrad) | `is_leader`, `joined_at` |
| `group_chats` | en rad per grupp: `archived_at/by`, `last_message_at/id` |
| `chat_messages` | `id`, `group_id`, `author_id` (SET NULL), `body` (högst 4000), `reply_to_id`, `client_id`, tider, `deleted_*`, `pinned_*`, `search` (tsvector, svenska). UNIQUE(`author_id`, `client_id`) |
| `chat_reads` | `last_read_message_id` per (profil, grupp). Klienten ser bara sina egna rader |

Funktioner (SECURITY DEFINER, bara `authenticated`, alla utgår från `auth.uid()`): `is_group_chat_member(gid)`, `is_group_chat_leader(gid)`, `can_post_in_group_chat(gid)`, `chat_unread_counts()`.

Triggers: ny grupp ger chatt; svar måste höra till samma grupp; senaste meddelande i `group_chats` uppdateras; BEFORE UPDATE låser allt utom `body`, `edited_at`, `deleted_at`, `deleted_by` (gäller även service role; `pinned_*` är låsta tills PR 4); läsmarkeringar städas när någon tas bort ur gruppen eller medlemskapet blir inaktivt.

## Kontroller

1. Inloggning (401) och medlemskap (403) i varje route. Samma SQL-funktion som RLS använder anropas med användarens egen klient (`lib/chat/authz.ts`), så API och RLS kan inte skilja sig åt. Okänd grupp ger samma 403 som icke-medlem.
2. RLS på `chat_messages`, `group_chats` (medlemmar) och `chat_reads` (egna rader).
3. Indatavalidering: text trimmas, 1 till 4000 tecken, inga NUL-tecken, `clientId` måste vara UUID.
4. Spamskydd i databasen (`lib/chat/ratelimit.ts`): högst 10 meddelanden per minut och 30 per 10 minuter per användare, över alla chattar. Svar 429 med `Retry-After`. Återförsök av ett redan sparat meddelande stoppas inte.
5. Idempotens: samma `clientId` ger samma meddelande (status 200, `duplicate: true`).
6. Databasskydd mot ändring av fel fält (trigger) och mot dubbletter (UNIQUE).
7. API:t returnerar aldrig mail eller telefon, bara namn, initialer och avatarfärger.

## GDPR

- Registerutdrag (`/api/account/export`) innehåller personens chattmeddelanden (`gruppchatt`) och läsmarkeringar. De hämtas med service role men filtreras strikt på personens egen profil, så att meddelanden i grupper personen lämnat också kommer med.
- Radering (`deletePersonData`): personens meddelandetexter raderas. Meddelandena töms, märks som borttagna och kopplingen till personen släpps (`author_id` NULL). Raderna finns kvar så att andras svar och tidsordning hänger ihop. Motivering: texten är personuppgifter som personen själv skrivit, så den ska bort vid radering (art. 17); att helt radera raderna skulle bryta andras svar. Samma princip som kommentarer på pass. `chat_reads` raderas.

## Kvarstående punkter

- Realtime: `chat_messages` läggs i publikationen `supabase_realtime`. Behörighetspolicy på `realtime.messages` (privata Broadcast-/Presence-kanaler, t.ex. "skriver just nu") ingår INTE; den kan inte provas säkert i en migration och behövs inte för `postgres_changes`. Läggs till i den PR som behöver den.
- `chat_unread_counts()` räknar högst 100 per chatt.
- RLS-policyn anropar `is_group_chat_member` per rad. Räcker för sidor om 50; vid sökning (PR 3) bör läsningen gå via en funktion som kontrollerar medlemskap en gång.
- Spamskyddet räknar före insättning, så två exakt samtidiga förfrågningar kan passera gränsen med något meddelande.
- Inget API för att arkivera chattar och inga fästa meddelanden ännu (PR 4).

## Prenumerera på Realtime (för frontend)

Ett enda delat flöde räcker för alla chattar, och RLS ser till att bara medlemmars händelser levereras:

```ts
supabase
  .channel('chat')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, p => onInsert(p.new as ChatMessageRow))
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, p => onUpdate(p.new as ChatMessageRow))
  .subscribe()
```

- Använd inget `filter` på `group_id`: gruppens id är fri text och kan innehålla tecken som bryter filtersyntaxen. Sortera på `payload.new.group_id` i klienten.
- Händelsen är en rå rad (`ChatMessageRow`, snake_case) utan författarens namn. Hämta det som saknas med `GET /api/chat/[groupId]/messages?after=<senaste kända id>`. Samma anrop fyller luckor efter tappad uppkoppling.
- Eget meddelande: matcha på `client_id` mot det optimistiska meddelandet.
- Redigering och borttagning kommer som UPDATE (`edited_at` / `deleted_at` satt, `body` tom). Inga DELETE-händelser förekommer.
- Hämta olästa och senaste aktivitet från `GET /api/chat` (och `POST .../read` när chatten visas).
