-- Enable Row Level Security
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

-- Settings: read-only for authenticated users
CREATE POLICY "Settings are readable by authenticated users"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Settings are updatable by authenticated users"
  ON settings FOR UPDATE
  TO authenticated
  USING (true);

-- SKU: full access for authenticated users
CREATE POLICY "SKU accessible by authenticated users"
  ON sku FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Imports: full access for authenticated users
CREATE POLICY "Imports accessible by authenticated users"
  ON imports FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Weekly metrics: full access for authenticated users
CREATE POLICY "Weekly metrics accessible by authenticated users"
  ON weekly_metrics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- AB tests: full access for authenticated users
CREATE POLICY "AB tests accessible by authenticated users"
  ON ab_tests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Import logs: full access for authenticated users
CREATE POLICY "Import logs accessible by authenticated users"
  ON import_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
