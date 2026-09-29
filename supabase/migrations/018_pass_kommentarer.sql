-- =====================================================================
-- Migration 018: Kommentarer på pass
-- Bygger ut tråden "Frågor och svar" (pass_messages) enligt
-- docs/plan-pass-kommentarer.md:
--   * Svar i tråd (en svarsnivå), redigering och mjuk borttagning.
--   * @nämningar i egen tabell.
--   * Läsa och skriva: bokade, ansvariga, vaktmästaren och admin för passets
--     församling. Aldrig kiosk, aldrig obokade ideella.
--   * Notiser får koppling till pass och kommentar, och tre nya typer.
--   * Inställning för mail om kommentarer.
-- Kräver 016 och 017. Bara tillägg. Idempotent: kan köras flera gånger.
-- =====================================================================

-- ---------- Nya kolumner på pass_messages ----------

ALTER TABLE public.pass_messages ADD COLUMN IF NOT EXISTS parent_id  BIGINT REFERENCES public.pass_messages(id) ON DELETE CASCADE;
ALTER TABLE public.pass_messages ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ;
ALTER TABLE public.pass_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Max 2000 tecken. NOT VALID så att migrationen inte stoppas av eventuella
-- äldre, längre frågor. Regeln gäller ändå för alla nya och ändrade rader.
ALTER TABLE public.pass_messages DROP CONSTRAINT IF EXISTS pass_messages_body_length;
ALTER TABLE public.pass_messages ADD CONSTRAINT pass_messages_body_length
  CHECK (char_length(body) <= 2000) NOT VALID;

-- En borttagen kommentar har alltid tom text.
ALTER TABLE public.pass_messages DROP CONSTRAINT IF EXISTS pass_messages_deleted_empty;
ALTER TABLE public.pass_messages ADD CONSTRAINT pass_messages_deleted_empty
  CHECK (deleted_at IS NULL OR body = '');

CREATE INDEX IF NOT EXISTS idx_pass_messages_pass_created ON public.pass_messages (pass_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pass_messages_parent      ON public.pass_messages (parent_id);

-- ---------- Behörighetsfunktioner ----------

-- Intern: får personen uid administrera församlingen target_church?
-- Samma regel som can_admin_church, men räknad på en given person i stället
-- för den inloggade. Kan inte anropas direkt av användare.
CREATE OR REPLACE FUNCTION public.can_admin_church_for(target_church INT, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT CASE p.admin_level
      WHEN 'super' THEN true
      WHEN 'pastorat' THEN
        target_church IS NULL OR EXISTS (
          SELECT 1 FROM public.churches t
          JOIN public.churches mine ON mine.id = p.church_id
          WHERE t.id = target_church AND t.pastorat_id IS NOT DISTINCT FROM mine.pastorat_id
        )
      WHEN 'forsamling' THEN target_church IS NOT NULL AND target_church = p.church_id
      ELSE false
    END
    FROM public.profiles p WHERE p.id = uid
  ), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Intern: får personen uid administrera passet?
CREATE OR REPLACE FUNCTION public.can_admin_pass_for(pass_id_arg INT, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT public.can_admin_church_for(ps.church_id, uid) FROM public.passes ps WHERE ps.id = pass_id_arg
  ), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Intern: har personen uid åtkomst till passets kommentarer?
-- Bokad, ansvarig, vaktmästare eller admin för passets församling. Aldrig kiosk.
CREATE OR REPLACE FUNCTION public.pass_thread_access_for(pass_id_arg INT, uid UUID)
RETURNS BOOLEAN AS $$
  SELECT uid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.role <> 'kiosk')
    AND (
      EXISTS (SELECT 1 FROM public.bookings b WHERE b.pass_id = pass_id_arg AND b.profile_id = uid)
      OR EXISTS (SELECT 1 FROM public.pass_responsible r WHERE r.pass_id = pass_id_arg AND r.profile_id = uid)
      OR EXISTS (SELECT 1 FROM public.passes ps WHERE ps.id = pass_id_arg AND ps.vk_profile_id = uid)
      OR public.can_admin_pass_for(pass_id_arg, uid)
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Offentlig: har uid (standard: inloggad användare) åtkomst till passets kommentarer?
-- Frågar man om någon annan än sig själv krävs att man själv har åtkomst till
-- passet, så att ingen kan kartlägga vem som är bokad var. Appens server
-- (ingen inloggad användare) får fråga fritt.
CREATE OR REPLACE FUNCTION public.can_access_pass_thread(pass_id_arg INT, uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    public.pass_thread_access_for(pass_id_arg, uid)
    AND (
      auth.uid() IS NULL
      OR uid = auth.uid()
      OR public.pass_thread_access_for(pass_id_arg, auth.uid())
    ),
    false
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- ---------- Trigger: kontroll vid ny kommentar ----------

CREATE OR REPLACE FUNCTION public.pass_messages_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT := auth.role();
  parent RECORD;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT pm.pass_id, pm.parent_id INTO parent FROM public.pass_messages pm WHERE pm.id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kommentaren du svarar på finns inte.' USING ERRCODE = '23503';
    END IF;
    IF parent.pass_id IS DISTINCT FROM NEW.pass_id THEN
      RAISE EXCEPTION 'Svaret måste höra till samma pass som kommentaren.' USING ERRCODE = '23514';
    END IF;
    IF parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Det går bara att svara på en kommentar, inte på ett svar.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Vanliga användare kan inte hitta på tid, redigeringsmärke eller namn.
  IF caller_role IS NOT NULL AND caller_role <> 'service_role' THEN
    NEW.created_at := now();
    NEW.edited_at := NULL;
    NEW.author_name := COALESCE((SELECT p.name FROM public.profiles p WHERE p.id = auth.uid()), NEW.author_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS pass_messages_before_insert ON public.pass_messages;
CREATE TRIGGER pass_messages_before_insert
  BEFORE INSERT ON public.pass_messages
  FOR EACH ROW EXECUTE FUNCTION public.pass_messages_before_insert();

-- ---------- Trigger: skydd vid ändring ----------
-- Författaren får ändra texten och ta bort sin kommentar.
-- Admin för passet får bara ta bort andras kommentarer.
-- Allt annat är låst. Appens server (service role) får ändra allt.

CREATE OR REPLACE FUNCTION public.protect_pass_message_update()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT := auth.role();
BEGIN
  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.pass_id        IS DISTINCT FROM OLD.pass_id
     OR NEW.author_id   IS DISTINCT FROM OLD.author_id
     OR NEW.author_name IS DISTINCT FROM OLD.author_name
     OR NEW.parent_id   IS DISTINCT FROM OLD.parent_id
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at
     OR NEW.is_staff_reply IS DISTINCT FROM OLD.is_staff_reply THEN
    RAISE EXCEPTION 'Bara texten i en kommentar kan ändras.' USING ERRCODE = '42501';
  END IF;

  -- En borttagen kommentar kan varken ändras eller återställas.
  IF OLD.deleted_at IS NOT NULL THEN
    IF NEW.body IS DISTINCT FROM OLD.body
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'Kommentaren är borttagen.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.author_id IS NOT NULL AND OLD.author_id = auth.uid() THEN
    IF NEW.deleted_at IS NOT NULL THEN
      NEW.body := '';
      NEW.deleted_at := now();
      NEW.edited_at := OLD.edited_at;
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
      NEW.edited_at := now();
    ELSE
      NEW.edited_at := OLD.edited_at;
    END IF;
    RETURN NEW;
  END IF;

  IF public.can_admin_pass(OLD.pass_id) THEN
    IF NEW.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Admin kan bara ta bort andras kommentarer, inte ändra dem.' USING ERRCODE = '42501';
    END IF;
    NEW.body := '';
    NEW.deleted_at := now();
    NEW.edited_at := OLD.edited_at;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Saknar behörighet att ändra kommentaren.' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS pass_messages_protect_update ON public.pass_messages;
CREATE TRIGGER pass_messages_protect_update
  BEFORE UPDATE ON public.pass_messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_pass_message_update();

-- ---------- RLS: pass_messages ----------

DROP POLICY IF EXISTS "pass_messages_select" ON public.pass_messages;
CREATE POLICY "pass_messages_select" ON public.pass_messages FOR SELECT
  USING (public.can_access_pass_thread(pass_id));

DROP POLICY IF EXISTS "pass_messages_insert" ON public.pass_messages;
CREATE POLICY "pass_messages_insert" ON public.pass_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND deleted_at IS NULL
    AND public.can_access_pass_thread(pass_id)
    AND (is_staff_reply = false OR public.can_admin_pass(pass_id) OR public.is_responsible_for(pass_id))
  );

DROP POLICY IF EXISTS "pass_messages_update" ON public.pass_messages;
CREATE POLICY "pass_messages_update" ON public.pass_messages FOR UPDATE
  USING (author_id = auth.uid() OR public.can_admin_pass(pass_id))
  WITH CHECK (author_id = auth.uid() OR public.can_admin_pass(pass_id));

-- Vanlig borttagning är mjuk (deleted_at). Riktig radering bara för admin.
DROP POLICY IF EXISTS "pass_messages_delete" ON public.pass_messages;
CREATE POLICY "pass_messages_delete" ON public.pass_messages FOR DELETE
  USING (public.can_admin_pass(pass_id));

-- ---------- @nämningar ----------

CREATE TABLE IF NOT EXISTS public.pass_message_mentions (
  message_id BIGINT REFERENCES public.pass_messages(id) ON DELETE CASCADE,
  profile_id UUID   REFERENCES public.profiles(id)      ON DELETE CASCADE,
  PRIMARY KEY (message_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_pass_message_mentions_profile ON public.pass_message_mentions (profile_id);

ALTER TABLE public.pass_message_mentions ENABLE ROW LEVEL SECURITY;

-- Alla nivåer (ideell, anställd, fadmin, padmin, superadmin) läser nämningar
-- på pass de har åtkomst till. Kiosk har aldrig åtkomst.
DROP POLICY IF EXISTS "pass_message_mentions_select" ON public.pass_message_mentions;
CREATE POLICY "pass_message_mentions_select" ON public.pass_message_mentions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.pass_messages m
    WHERE m.id = message_id AND public.can_access_pass_thread(m.pass_id)
  ));

-- Bara kommentarens författare kan nämna, och bara personer med åtkomst till passet.
DROP POLICY IF EXISTS "pass_message_mentions_insert" ON public.pass_message_mentions;
CREATE POLICY "pass_message_mentions_insert" ON public.pass_message_mentions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pass_messages m
    WHERE m.id = message_id
      AND m.author_id = auth.uid()
      AND m.deleted_at IS NULL
      AND public.can_access_pass_thread(m.pass_id, profile_id)
  ));

-- Ingen UPDATE-regel: nämningar ändras inte, de tas bort och läggs till.
DROP POLICY IF EXISTS "pass_message_mentions_delete" ON public.pass_message_mentions;
CREATE POLICY "pass_message_mentions_delete" ON public.pass_message_mentions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.pass_messages m
    WHERE m.id = message_id AND m.author_id = auth.uid()
  ));

-- ---------- Notiser ----------

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS pass_id    INT    REFERENCES public.passes(id)        ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS comment_id BIGINT REFERENCES public.pass_messages(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reminder','cancelled','new_pass','message','signup','waitlist_joined','waitlist_promoted',
                  'comment','comment_reply','comment_mention'));

CREATE INDEX IF NOT EXISTS idx_notifications_comment        ON public.notifications (comment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_pass_mail ON public.notifications (user_id, pass_id, emailed_at DESC);

-- ---------- Notisinställningar ----------

ALTER TABLE public.notif_settings ADD COLUMN IF NOT EXISTS kommentar_mail BOOLEAN NOT NULL DEFAULT true;

-- ---------- Rättigheter på funktionerna ----------

REVOKE EXECUTE ON FUNCTION public.pass_messages_before_insert()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_pass_message_update()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_admin_church_for(INT, UUID)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_admin_pass_for(INT, UUID)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pass_thread_access_for(INT, UUID)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_pass_thread(INT, UUID)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_access_pass_thread(INT, UUID)  TO authenticated, service_role;
