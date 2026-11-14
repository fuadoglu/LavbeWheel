CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  username VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mfa_cipher VARBINARY(128) NOT NULL,
  mfa_nonce BINARY(24) NOT NULL,
  mfa_key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  recovery_hashes JSON NOT NULL,
  role ENUM('owner','editor','reviewer','publisher') NOT NULL,
  disabled_at DATETIME(6) NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash BINARY(32) NOT NULL PRIMARY KEY,
  user_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  csrf_cipher VARBINARY(128) NOT NULL,
  csrf_nonce BINARY(24) NOT NULL,
  csrf_key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  issued_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  idle_expires_at DATETIME(6) NOT NULL,
  absolute_expires_at DATETIME(6) NOT NULL,
  INDEX admin_sessions_user_idx (user_id),
  INDEX admin_sessions_expiry_idx (idle_expires_at, absolute_expires_at),
  CONSTRAINT admin_sessions_user_fk FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS content_versions (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  kind VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  locale VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('draft','validated','reviewed','published','archived') NOT NULL,
  source_hash BINARY(32) NOT NULL,
  payload_cipher MEDIUMBLOB NOT NULL,
  nonce BINARY(24) NOT NULL,
  key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  author_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reviewer_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  revision INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  reviewed_at DATETIME(6) NULL,
  INDEX content_versions_scope_idx (kind, locale, revision),
  UNIQUE INDEX content_versions_revision_uq (kind, locale, revision),
  INDEX content_versions_state_idx (state, created_at),
  CONSTRAINT content_versions_author_fk FOREIGN KEY (author_id) REFERENCES admin_users(id),
  CONSTRAINT content_versions_reviewer_fk FOREIGN KEY (reviewer_id) REFERENCES admin_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS publish_jobs (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  job_type ENUM('publish','rollback') NOT NULL DEFAULT 'publish',
  state ENUM('queued','exporting','validating','building','awaiting-promotion','deploying','succeeded','failed','rolled-back') NOT NULL,
  manifest_hash BINARY(32) NOT NULL,
  artifact_hash BINARY(32) NULL,
  rollback_target_hash BINARY(32) NULL,
  runner_token_hash BINARY(32) NULL,
  runner_expires_at DATETIME(6) NULL,
  error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actor_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  INDEX publish_jobs_state_idx (state, created_at),
  CONSTRAINT publish_jobs_actor_fk FOREIGN KEY (actor_id) REFERENCES admin_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS publish_job_versions (
  job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  PRIMARY KEY (job_id,version_id),
  CONSTRAINT publish_job_versions_job_fk FOREIGN KEY (job_id) REFERENCES publish_jobs(id),
  CONSTRAINT publish_job_versions_version_fk FOREIGN KEY (version_id) REFERENCES content_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS publication_history (
  artifact_hash BINARY(32) NOT NULL PRIMARY KEY,
  job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  released_at DATETIME(6) NOT NULL,
  INDEX publication_history_job_idx (job_id),
  CONSTRAINT publication_history_job_fk FOREIGN KEY (job_id) REFERENCES publish_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  actor_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  object_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(6) NOT NULL,
  INDEX audit_events_time_idx (created_at, id),
  INDEX audit_events_actor_idx (actor_id, created_at),
  CONSTRAINT audit_events_actor_fk FOREIGN KEY (actor_id) REFERENCES admin_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS active_publications (
  singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  job_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  artifact_hash BINARY(32) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  CONSTRAINT active_publications_singleton_ck CHECK (singleton_id = 1),
  CONSTRAINT active_publications_job_fk FOREIGN KEY (job_id) REFERENCES publish_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
