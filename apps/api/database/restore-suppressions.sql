-- Mandatory after restoring any share backup, before exposing the restored database.
-- The deletion journal is backed up independently and must be restored first.
UPDATE shares AS s
JOIN deletion_journal AS d ON d.share_id_hash = UNHEX(SHA2(s.id, 256))
SET s.payload_cipher = NULL, s.nonce = NULL, s.revoked_at = COALESCE(s.revoked_at, d.deleted_at), s.unavailable_reason = 'purged';
