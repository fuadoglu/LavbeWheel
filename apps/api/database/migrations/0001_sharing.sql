CREATE TABLE IF NOT EXISTS shares (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  payload_cipher MEDIUMBLOB NULL,
  nonce BINARY(24) NULL,
  key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  schema_version SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  revoke_hash BINARY(32) NOT NULL,
  unavailable_reason ENUM('revoked','expired','purged') NULL,
  INDEX shares_expiry_idx (expires_at),
  INDEX shares_status_idx (revoked_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS idempotency (
  key_hash BINARY(32) NOT NULL PRIMARY KEY,
  request_hash BINARY(32) NOT NULL,
  response_cipher MEDIUMBLOB NOT NULL,
  nonce BINARY(24) NOT NULL,
  key_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  INDEX idempotency_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rate_buckets (
  key_hash BINARY(32) NOT NULL,
  window_start BIGINT UNSIGNED NOT NULL,
  count INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (key_hash, window_start),
  INDEX rate_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS deletion_journal (
  share_id_hash BINARY(32) NOT NULL PRIMARY KEY,
  deleted_at DATETIME(6) NOT NULL,
  retain_until DATETIME(6) NOT NULL,
  INDEX deletion_retention_idx (retain_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
