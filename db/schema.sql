-- Shared register document (single row, id = 'default').
-- `version` drives optimistic concurrency: a write states the version it read,
-- so a stale save is rejected rather than silently overwriting someone else.
CREATE TABLE IF NOT EXISTS register (
  id         TEXT PRIMARY KEY,
  document   TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Snapshot of the document each accepted write replaced. Nothing is stored in
-- the browser, so this is the only way back from a bad edit.
CREATE TABLE IF NOT EXISTS register_revision (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id TEXT NOT NULL,
  document    TEXT NOT NULL,
  version     INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_revision_register
  ON register_revision (register_id, version DESC);
