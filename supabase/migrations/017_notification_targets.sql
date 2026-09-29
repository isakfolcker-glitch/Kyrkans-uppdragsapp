-- Migration 017: länka notiser till pass och kommentar.
-- Idempotent för miljöer där kolumnerna redan lagts till manuellt.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pass_id INT REFERENCES public.passes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS comment_id BIGINT REFERENCES public.pass_messages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_pass_id
  ON public.notifications(pass_id);

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications(comment_id);
