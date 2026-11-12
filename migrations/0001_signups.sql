-- Signups. Email addresses and ZIP codes are private: they are never published or written to AT Protocol records.

CREATE TABLE IF NOT EXISTS email_signups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  zip           TEXT,                        -- optional, 5 digits; used only for counts by state/district
  token         TEXT NOT NULL UNIQUE,        -- confirmation + unsubscribe token
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  confirmed_at  TEXT,                        -- double opt-in: set when the confirmation link is opened
  unsubscribed_at TEXT,
  ip_hash       TEXT                         -- salted hash, for rate limiting only
);

CREATE TABLE IF NOT EXISTS atproto_supporters (
  did           TEXT PRIMARY KEY,            -- the person's permanent AT Protocol identifier
  handle        TEXT,
  zip           TEXT,                        -- optional, private (never written to their public repo)
  follow_uri    TEXT,                        -- at:// URI of their follow of the project account, if they followed
  supporter_uri TEXT,                        -- at:// URI of their public org.zipcodedistricts.supporter record, if any
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS email_signups_ip ON email_signups (ip_hash, created_at);
