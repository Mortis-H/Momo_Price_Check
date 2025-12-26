CREATE TABLE IF NOT EXISTS lowest_prices (
  prod_id TEXT PRIMARY KEY,
  min_price REAL,
  trust_level INTEGER DEFAULT 1, -- 0=Trusted, 1=Unverified
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS price_report_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prod_id TEXT,
  price REAL,
  ip_hash TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_lookup ON price_report_history(prod_id, price);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prod_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_prod_id ON price_history(prod_id);
CREATE INDEX IF NOT EXISTS idx_history_recorded_at ON price_history(recorded_at);
