-- Kyrkor = fysiska kyrkbyggnader inom en församling
CREATE TABLE IF NOT EXISTS kyrkor (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  forsamling_id INT REFERENCES churches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE kyrkor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kyrkor_select_all" ON kyrkor FOR SELECT USING (true);
CREATE POLICY "kyrkor_modify_admin" ON kyrkor FOR ALL USING (is_admin());
