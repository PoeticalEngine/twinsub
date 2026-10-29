-- Twinsub Lifetime: a one-time Dodo payment that unlocks bring-your-own-key explanations for good.
-- Kept apart from subs (Dodo subscriptions): a person can hold both, so its installs are linked in their own table.
CREATE TABLE licenses (
  code TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  customer_id TEXT,
  email TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE license_installs (install TEXT PRIMARY KEY, code TEXT NOT NULL, linked_at INTEGER NOT NULL);
CREATE INDEX license_installs_code ON license_installs (code);
