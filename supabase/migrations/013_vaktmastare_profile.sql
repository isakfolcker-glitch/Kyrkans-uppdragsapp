-- Vaktmästare kan nu kopplas till en riktig anställd-profil, så att mail kan
-- skickas till dem. Befintlig fritext i vk/tel behålls som fallback för gamla
-- pass eller pass utan kopplad vaktmästare.
alter table passes add column if not exists vk_profile_id uuid references profiles(id) on delete set null;
