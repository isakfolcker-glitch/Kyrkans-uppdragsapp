-- =====================================================================
-- Migration 020: Gruppchatt, grund (PR 1)
-- En chatt per uppdragsgrupp (groups.id är TEXT). Se docs/gruppchatt.md.
--   * Åtkomst: rad i profile_groups OCH aktivt, accepterat medlemskap i
--     gruppens församling (gemensam grupp: aktivt medlemskap i någon
--     församling). Kiosk nekas alltid. Ingen admingren: varken fadmin, padmin
--     eller superadmin läser utan medlemskap i gruppen.
--   * Klienten har bara SELECT. Alla skrivningar går via appens API (service role).
--   * Gruppansvarig: profile_groups.is_leader.
-- Kräver 016-019. Bara tillägg. Idempotent: kan köras flera gånger.
-- ---------------------------------------------------------------------
-- OBS: Kör aldrig 014 eller 015. Kör bara mot testdatabasen först.
-- =====================================================================

-- ---------- profile_groups: gruppansvarig och när personen blev medlem ----------

ALTER TABLE public.profile_groups ADD COLUMN IF NOT EXISTS is_leader BOOLEAN NOT NULL DEFAULT false;
-- Befintliga medlemmar får tidpunkten för migrationen. Används bara för att
-- inte räkna gammal historik som oläst för en ny medlem.
ALTER TABLE public.profile_groups ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

-- ---------- Tabeller ----------

CREATE TABLE IF NOT EXISTS public.group_chats (
  group_id         TEXT PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at      TIMESTAMPTZ,
  archived_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_at  TIMESTAMPTZ,
  -- Ingen främmande nyckel: chat_messages raderas tillsammans med gruppen.
  last_message_id  BIGINT
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id    TEXT   NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_id   UUID   REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        TEXT   NOT NULL CHECK (char_length(body) <= 4000),
  -- Finns redan nu, gränssnittet för svar kommer i PR 2.
  reply_to_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  -- Skapas av klienten och gör att ett återförsök inte ger dubbletter.
  client_id   UUID   NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Låsta i PR 1 (se trigger nedan), öppnas i PR 4.
  pinned_at   TIMESTAMPTZ,
  pinned_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  search      TSVECTOR GENERATED ALWAYS AS (to_tsvector('swedish'::regconfig, body)) STORED,
  CONSTRAINT chat_messages_author_client_unique UNIQUE (author_id, client_id),
  -- En borttagen rad har alltid tom text (som i 018). En vanlig rad har text.
  CONSTRAINT chat_messages_deleted_empty CHECK (deleted_at IS NULL OR body = ''),
  CONSTRAINT chat_messages_body_not_blank CHECK (deleted_at IS NOT NULL OR char_length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id_desc ON public.chat_messages (group_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_search       ON public.chat_messages USING GIN (search);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to     ON public.chat_messages (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned       ON public.chat_messages (group_id) WHERE pinned_at IS NOT NULL;
-- Spamskyddet räknar en persons senaste meddelanden.
CREATE INDEX IF NOT EXISTS idx_chat_messages_author_time  ON public.chat_messages (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_reads (
  profile_id           UUID   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id             TEXT   NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, group_id)
);

-- En chatt för varje befintlig grupp, och automatiskt för nya.
INSERT INTO public.group_chats (group_id)
SELECT g.id FROM public.groups g
ON CONFLICT (group_id) DO NOTHING;

-- ---------- Behörighetsfunktioner ----------
-- Körs som ägare så att de kan fråga medlemskap utan att RLS i vägen.
-- Alla utgår från den inloggade (auth.uid()), ingen kan fråga om någon annan.

-- Är den inloggade medlem i gruppens chatt?
CREATE OR REPLACE FUNCTION public.is_group_chat_member(gid TEXT)
RETURNS BOOLEAN AS $$
  SELECT auth.uid() IS NOT NULL
    -- Kiosk nekas alltid (gammal profilroll eller kioskmedlemskap)
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'kiosk')
    AND NOT EXISTS (
      SELECT 1 FROM public.profile_churches k
      WHERE k.profile_id = auth.uid() AND k.role = 'kiosk' AND k.active
    )
    AND EXISTS (
      SELECT 1
      FROM public.profile_groups pg
      JOIN public.groups g ON g.id = pg.group_id
      WHERE pg.profile_id = auth.uid()
        AND pg.group_id = gid
        AND EXISTS (
          SELECT 1 FROM public.profile_churches pc
          WHERE pc.profile_id = auth.uid()
            AND pc.active
            AND pc.accepted_at IS NOT NULL
            AND (g.church_id IS NULL OR pc.church_id = g.church_id)
        )
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Är den inloggade gruppansvarig (och medlem) i gruppen?
CREATE OR REPLACE FUNCTION public.is_group_chat_leader(gid TEXT)
RETURNS BOOLEAN AS $$
  SELECT public.is_group_chat_member(gid)
    AND EXISTS (
      SELECT 1 FROM public.profile_groups pg
      WHERE pg.profile_id = auth.uid() AND pg.group_id = gid AND pg.is_leader
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Får den inloggade skriva i chatten? Medlem och chatten är inte arkiverad.
CREATE OR REPLACE FUNCTION public.can_post_in_group_chat(gid TEXT)
RETURNS BOOLEAN AS $$
  SELECT public.is_group_chat_member(gid)
    AND EXISTS (SELECT 1 FROM public.group_chats gc WHERE gc.group_id = gid AND gc.archived_at IS NULL);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Olästa för alla den inloggades chattar i ett anrop. Räknar högst 100 per chatt.
-- Egna meddelanden och borttagna räknas inte. Utan läsmarkering räknas bara
-- det som kom efter att personen blev medlem i gruppen.
CREATE OR REPLACE FUNCTION public.chat_unread_counts()
RETURNS TABLE (group_id TEXT, unread_count BIGINT, last_message_id BIGINT, last_message_at TIMESTAMPTZ) AS $$
  SELECT gc.group_id,
    (
      SELECT count(*) FROM (
        SELECT 1 FROM public.chat_messages m
        WHERE m.group_id = gc.group_id
          AND m.deleted_at IS NULL
          AND m.author_id IS DISTINCT FROM auth.uid()
          AND m.id > COALESCE(r.last_read_message_id, 0)
          AND (r.profile_id IS NOT NULL OR pg.joined_at IS NULL OR m.created_at >= pg.joined_at)
        LIMIT 100
      ) recent
    ) AS unread_count,
    gc.last_message_id,
    gc.last_message_at
  FROM public.profile_groups pg
  JOIN public.group_chats gc ON gc.group_id = pg.group_id
  LEFT JOIN public.chat_reads r ON r.profile_id = pg.profile_id AND r.group_id = pg.group_id
  WHERE pg.profile_id = auth.uid()
    AND public.is_group_chat_member(pg.group_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ---------- Triggers ----------

-- Ny grupp får automatiskt en chatt. Admin kan skapa grupper via klienten,
-- därför SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.create_group_chat()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.group_chats (group_id) VALUES (NEW.id) ON CONFLICT (group_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS groups_create_chat ON public.groups;
CREATE TRIGGER groups_create_chat
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.create_group_chat();

-- Svar måste höra till samma grupp.
CREATE OR REPLACE FUNCTION public.chat_messages_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reply_to_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chat_messages m WHERE m.id = NEW.reply_to_id AND m.group_id = NEW.group_id
    ) THEN
      RAISE EXCEPTION 'Meddelandet du svarar på finns inte i den här chatten.' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS chat_messages_before_insert ON public.chat_messages;
CREATE TRIGGER chat_messages_before_insert
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_before_insert();

-- Chattens senaste meddelande uppdateras vid varje nytt meddelande.
CREATE OR REPLACE FUNCTION public.chat_messages_after_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.group_chats
  SET last_message_at = NEW.created_at, last_message_id = NEW.id
  WHERE group_id = NEW.group_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS chat_messages_after_insert ON public.chat_messages;
CREATE TRIGGER chat_messages_after_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_after_insert();

-- Skydd vid ändring, gäller alla (även service role). Bara body, edited_at,
-- deleted_at och deleted_by får ändras. pinned_* är låsta i PR 1.
-- Undantag som databasen själv behöver: author_id, reply_to_id, deleted_by och
-- pinned_by får sättas till NULL (ON DELETE SET NULL när en profil eller ett
-- meddelande tas bort).
CREATE OR REPLACE FUNCTION public.chat_messages_protect_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id         IS DISTINCT FROM OLD.id
     OR NEW.group_id   IS DISTINCT FROM OLD.group_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.client_id  IS DISTINCT FROM OLD.client_id
     OR NEW.pinned_at  IS DISTINCT FROM OLD.pinned_at
     OR (NEW.author_id   IS DISTINCT FROM OLD.author_id   AND NEW.author_id   IS NOT NULL)
     OR (NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id AND NEW.reply_to_id IS NOT NULL)
     OR (NEW.pinned_by   IS DISTINCT FROM OLD.pinned_by   AND NEW.pinned_by   IS NOT NULL) THEN
    RAISE EXCEPTION 'Bara texten i ett chattmeddelande kan ändras.' USING ERRCODE = '42501';
  END IF;

  -- Ett borttaget meddelande kan varken ändras eller återställas.
  IF OLD.deleted_at IS NOT NULL THEN
    IF NEW.body IS DISTINCT FROM OLD.body
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'Meddelandet är borttaget.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    NEW.body := '';
    NEW.edited_at := OLD.edited_at;
  ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
  ELSE
    NEW.edited_at := OLD.edited_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS chat_messages_protect_update ON public.chat_messages;
CREATE TRIGGER chat_messages_protect_update
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_protect_update();

-- Städning: lämnar någon gruppen, eller slutar ett medlemskap vara aktivt,
-- försvinner personens läsmarkering för de chattarna. Admin kan ta bort
-- gruppmedlemmar via klienten, därför SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.chat_reads_cleanup_group_member()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.chat_reads WHERE profile_id = OLD.profile_id AND group_id = OLD.group_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profile_groups_chat_reads_cleanup ON public.profile_groups;
CREATE TRIGGER profile_groups_chat_reads_cleanup
  AFTER DELETE ON public.profile_groups
  FOR EACH ROW EXECUTE FUNCTION public.chat_reads_cleanup_group_member();

CREATE OR REPLACE FUNCTION public.chat_reads_cleanup_membership()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.chat_reads r
  WHERE r.profile_id = NEW.profile_id
    AND r.group_id IN (SELECT g.id FROM public.groups g WHERE g.church_id = NEW.church_id);
  -- Gemensamma grupper kräver bara något aktivt medlemskap
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_churches pc
    WHERE pc.profile_id = NEW.profile_id AND pc.active AND pc.accepted_at IS NOT NULL
  ) THEN
    DELETE FROM public.chat_reads r
    WHERE r.profile_id = NEW.profile_id
      AND r.group_id IN (SELECT g.id FROM public.groups g WHERE g.church_id IS NULL);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profile_churches_chat_reads_cleanup ON public.profile_churches;
CREATE TRIGGER profile_churches_chat_reads_cleanup
  AFTER UPDATE OF active ON public.profile_churches
  FOR EACH ROW WHEN (OLD.active IS TRUE AND NEW.active IS FALSE)
  EXECUTE FUNCTION public.chat_reads_cleanup_membership();

-- ---------- RLS ----------
-- Samma regel för alla fem nivåer: bara medlemskap i gruppen ger läsning.

ALTER TABLE public.group_chats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reads    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_chats_select" ON public.group_chats;
CREATE POLICY "group_chats_select" ON public.group_chats FOR SELECT
  USING (public.is_group_chat_member(group_id));

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT
  USING (public.is_group_chat_member(group_id));

DROP POLICY IF EXISTS "chat_reads_select" ON public.chat_reads;
CREATE POLICY "chat_reads_select" ON public.chat_reads FOR SELECT
  USING (profile_id = auth.uid());

-- Inga INSERT-, UPDATE- eller DELETE-regler finns, och rättigheterna tas bort
-- så att klienten inte kan skriva ens om en regel av misstag skulle läggas till.
REVOKE ALL ON public.group_chats   FROM anon, authenticated;
REVOKE ALL ON public.chat_messages FROM anon, authenticated;
REVOKE ALL ON public.chat_reads    FROM anon, authenticated;
GRANT SELECT ON public.group_chats   TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;
GRANT SELECT ON public.chat_reads    TO authenticated;

-- ---------- Rättigheter på funktionerna ----------

REVOKE EXECUTE ON FUNCTION public.is_group_chat_member(TEXT)   FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_group_chat_leader(TEXT)   FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_post_in_group_chat(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.chat_unread_counts()         FROM PUBLIC, anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_group_chat_member(TEXT)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_group_chat_leader(TEXT)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_post_in_group_chat(TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.chat_unread_counts()         TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_group_chat()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_messages_before_insert()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_messages_after_insert()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_messages_protect_update()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_reads_cleanup_group_member()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chat_reads_cleanup_membership()     FROM PUBLIC, anon, authenticated;

-- ---------- Realtime ----------
-- Klienten prenumererar på ändringar i chat_messages. Realtime tillämpar
-- chat_messages_select för varje mottagare, så bara medlemmar får händelserna.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
