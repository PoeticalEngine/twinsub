-- Daily counters: i:<install>, ip:<address>, all, tok_in:<model>, tok_out:<model>
CREATE TABLE usage (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, k));
-- Finished answers, keyed by sha256 of video id + target language + line + marked text
CREATE TABLE explanations (key TEXT PRIMARY KEY, text TEXT NOT NULL, model TEXT, created_at INTEGER NOT NULL);
