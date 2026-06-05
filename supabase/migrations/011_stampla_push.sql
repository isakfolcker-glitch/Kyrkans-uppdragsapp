-- Push-prenumerationer för Stämpla-appen
CREATE TABLE stampla_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  remind_in_time text NOT NULL DEFAULT '07:45',
  remind_out_time text NOT NULL DEFAULT '16:30',
  work_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  active boolean NOT NULL DEFAULT true,
  last_sent_in timestamptz,
  last_sent_out timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stampla_push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Endast åtkomst via admin/service role (device_id används som hemlighet)
