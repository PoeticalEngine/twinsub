-- Twinsub Pro subscriptions from Dodo Payments. code is the Pro code the subscriber can enter on another computer.
CREATE TABLE subs (
  code TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  email TEXT,
  status TEXT NOT NULL,
  period_end TEXT,
  cancel_at_end INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Installs that use a Pro code: the one that paid, plus any where the code was entered.
CREATE TABLE installs (install TEXT PRIMARY KEY, code TEXT NOT NULL, linked_at INTEGER NOT NULL);
CREATE INDEX installs_code ON installs (code);
