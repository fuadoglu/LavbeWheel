<?php

declare(strict_types=1);

use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Database;
use Lavbe\Api\Infrastructure\Limits;

require dirname(__DIR__) . '/vendor/autoload.php';
$pdo = Database::connect(Config::fromEnvironment());
$backupDays = Limits::retention()['backupDays'];
$pdo->beginTransaction();
try {
    $pdo->exec('CREATE TEMPORARY TABLE expired_payload_ids (id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY) ENGINE=Memory');
    $pdo->exec('INSERT INTO expired_payload_ids SELECT id FROM shares WHERE expires_at <= UTC_TIMESTAMP(6) AND payload_cipher IS NOT NULL');
    $pdo->exec("UPDATE shares AS s JOIN expired_payload_ids AS e ON e.id=s.id SET s.payload_cipher=NULL,s.nonce=NULL,s.unavailable_reason='expired'");
    $journal = $pdo->prepare("INSERT INTO deletion_journal(share_id_hash,deleted_at,retain_until) SELECT UNHEX(SHA2(id,256)),UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL :days DAY) FROM expired_payload_ids ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at),retain_until=VALUES(retain_until)");
    $journal->bindValue(':days', $backupDays, PDO::PARAM_INT);
    $journal->execute();
    $pdo->exec('DELETE FROM idempotency WHERE expires_at <= UTC_TIMESTAMP(6)');
    $pdo->exec('UPDATE publish_jobs SET runner_token_hash=NULL WHERE runner_expires_at<=UTC_TIMESTAMP(6) AND runner_token_hash IS NOT NULL');
    $pdo->exec('DELETE FROM rate_buckets WHERE expires_at <= UTC_TIMESTAMP()');
    $pdo->exec('DELETE FROM deletion_journal WHERE retain_until <= UTC_TIMESTAMP(6)');
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, "Cleanup failed; no details logged.\n");
    exit(1);
}
fwrite(STDOUT, "Expired data cleanup completed.\n");
