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

CREATE TABLE IF NOT EXISTS app_bootstrap (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  completed_at TEXT NOT NULL
);

-- Application accounts. Authentication uses passkeys only; no passwords are
-- stored. Initial administrator enrolment also requires the setup secret.
CREATE TABLE IF NOT EXISTS app_user (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  scope_all    INTEGER NOT NULL DEFAULT 0 CHECK (scope_all IN (0, 1)),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at   TEXT NOT NULL,
  created_by   TEXT
);

CREATE TABLE IF NOT EXISTS user_site (
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS passkey_credential (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT NOT NULL DEFAULT '[]',
  device_type  TEXT NOT NULL,
  backed_up    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey_credential(user_id);

CREATE TABLE IF NOT EXISTS auth_challenge (
  id           TEXT PRIMARY KEY,
  purpose      TEXT NOT NULL CHECK (purpose IN ('setup', 'login', 'invite', 'add-passkey')),
  challenge    TEXT NOT NULL,
  user_id      TEXT,
  email        TEXT,
  display_name TEXT,
  invite_hash  TEXT,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
);

CREATE TABLE IF NOT EXISTS app_session (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_user ON app_session(user_id, expires_at);

CREATE TABLE IF NOT EXISTS user_invite (
  token_hash   TEXT PRIMARY KEY,
  email        TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  scope_all    INTEGER NOT NULL DEFAULT 0 CHECK (scope_all IN (0, 1)),
  site_ids     TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
);

-- Invitations are deliberately short-lived. Issuing a replacement for the
-- same email revokes every earlier unused link before the new link is stored.
CREATE TRIGGER IF NOT EXISTS revoke_previous_user_invites
BEFORE INSERT ON user_invite
BEGIN
  UPDATE user_invite
     SET used_at = NEW.created_at
   WHERE email = NEW.email AND used_at IS NULL;
END;

CREATE TRIGGER IF NOT EXISTS cap_user_invite_to_one_hour
AFTER INSERT ON user_invite
BEGIN
  UPDATE user_invite
     SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+1 hour')
   WHERE token_hash = NEW.token_hash;
END;

CREATE TABLE IF NOT EXISTS register_publication (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id      TEXT NOT NULL,
  site_id          TEXT NOT NULL,
  document         TEXT NOT NULL,
  register_version INTEGER NOT NULL,
  release_note     TEXT NOT NULL DEFAULT '',
  published_at     TEXT NOT NULL,
  published_by     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_publication_register ON register_publication(register_id, site_id, id DESC);

CREATE TABLE IF NOT EXISTS security_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  actor_id   TEXT,
  route      TEXT,
  detail     TEXT NOT NULL DEFAULT '',
  cf_ray     TEXT,
  country    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_event_created ON security_event(created_at DESC);
