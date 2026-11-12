-- 0002: Web Push subscriptions for approval-request notifications (v19.6.266).
-- One row per push endpoint (the seat signed in on that device owns it); written only by the Edge API
-- (functions/_lib/web_push.js, which also creates the table on first use with the same definition).
-- Never exported from a local SQLite DB (build/export_d1_seed.py EDGE_RUNTIME_TABLES).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  p256dh TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL DEFAULT 'en',
  key_fp TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  last_sent_at TEXT DEFAULT '',
  last_status INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id, updated_at);
