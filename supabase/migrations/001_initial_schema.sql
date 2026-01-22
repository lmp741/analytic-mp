-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Settings table (single row)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  summary_min_impressions BIGINT NOT NULL DEFAULT 20000,
  ctr_drop_pct FLOAT NOT NULL DEFAULT -0.15,
  cr_to_cart_drop_pct FLOAT NOT NULL DEFAULT -0.15,
  orders_drop_pct FLOAT NOT NULL DEFAULT -0.20,
  revenue_drop_pct FLOAT NOT NULL DEFAULT -0.20,
  drr_worse_pct FLOAT NOT NULL DEFAULT 0.15,
  max_zone_tags INTEGER NOT NULL DEFAULT 2,
  ignore_prev_zero BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settings_single_row CHECK (id = 1)
);

-- SKU table
CREATE TABLE IF NOT EXISTS sku (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artikul TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Imports table
CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketplace TEXT NOT NULL CHECK (marketplace IN ('WB', 'OZON')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IMPORTED', 'FAILED')),
  error_message TEXT,
  UNIQUE(marketplace, period_start),
  UNIQUE(file_hash)
);

-- Weekly metrics table
CREATE TABLE IF NOT EXISTS weekly_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('WB', 'OZON')),
  artikul TEXT NOT NULL REFERENCES sku(artikul),
  impressions BIGINT NOT NULL,
  visits BIGINT NOT NULL,
  ctr FLOAT NOT NULL CHECK (ctr >= 0 AND ctr <= 1),
  add_to_cart BIGINT NOT NULL,
  cr_to_cart FLOAT NOT NULL CHECK (cr_to_cart >= 0 AND cr_to_cart <= 1),
  orders BIGINT NOT NULL,
  revenue NUMERIC,
  price_avg NUMERIC,
  drr FLOAT CHECK (drr IS NULL OR (drr >= 0 AND drr <= 1)),
  stock_end BIGINT,
  delivery_avg_hours FLOAT,
  rating FLOAT CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  reviews_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(import_id, marketplace, artikul)
);

-- AB tests table
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketplace TEXT NOT NULL CHECK (marketplace IN ('WB', 'OZON')),
  artikul TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  baseline_period_start DATE NOT NULL,
  baseline_metrics JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  removed_at TIMESTAMPTZ
);

-- Import logs table
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_id UUID REFERENCES imports(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_imports_marketplace_period ON imports(marketplace, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_import ON weekly_metrics(import_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metrics_marketplace_artikul ON weekly_metrics(marketplace, artikul);
CREATE INDEX IF NOT EXISTS idx_ab_tests_marketplace_active ON ab_tests(marketplace, is_active);
CREATE INDEX IF NOT EXISTS idx_ab_tests_marketplace_artikul ON ab_tests(marketplace, artikul);
CREATE INDEX IF NOT EXISTS idx_import_logs_import ON import_logs(import_id);

-- Seed settings row
INSERT INTO settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
