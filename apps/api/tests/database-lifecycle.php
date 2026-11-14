<?php

declare(strict_types=1);

use Lavbe\Api\Application\ShareService;
use Lavbe\Api\Domain\WheelRequestValidator;
use Lavbe\Api\Domain\WheelSemanticValidator;
use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;
use Lavbe\Api\Infrastructure\Database;
use Lavbe\Api\Infrastructure\MigrationRunner;

require_once dirname(__DIR__) . '/vendor/autoload.php';

$dsn = getenv('LAVBE_TEST_DATABASE_DSN') ?: '';
if (!preg_match('/(?:^|;)dbname=lavbe_api_test(?:;|$)/', $dsn)) {
    fwrite(STDERR, "BLOCKED: set LAVBE_TEST_DATABASE_DSN to an isolated database named lavbe_api_test.\n");
    exit(2);
}
$key = str_repeat('k', 32);
$config = new Config('https://lavbe.test', 'https://lavbe.test', $dsn, getenv('LAVBE_TEST_DATABASE_USER') ?: '', getenv('LAVBE_TEST_DATABASE_PASSWORD') ?: '', 'test', $key, str_repeat('r', 32));
$pdo = Database::connect($config);
$pdo->exec('DROP TABLE IF EXISTS active_publications, publication_history, publish_job_versions, audit_events, content_versions, admin_sessions, publish_jobs, admin_users, idempotency, rate_buckets, deletion_journal, shares, schema_migrations');
(new MigrationRunner($pdo))->migrate();
$service = new ShareService($pdo, $config, new Crypto($config), new WheelRequestValidator(new WheelSemanticValidator()));
$wheel = json_decode(file_get_contents(dirname(__DIR__, 3) . '/contracts/examples/wheel.json'), true, flags: JSON_THROW_ON_ERROR);
$body = ['wheel' => $wheel, 'ttlDays' => 30];
$now = time();
$created = $service->create($body, '9e553a11-255d-4a4d-bc9b-7f67d360d8fb', 'test-network', $now);
$replayed = $service->create($body, '9e553a11-255d-4a4d-bc9b-7f67d360d8fb', 'test-network', $now + 1);
if ($created !== $replayed || !preg_match('/^[A-Za-z0-9_-]{32}$/', $created['shareId']) || !preg_match('/^[A-Za-z0-9_-]{43}$/', $created['manageToken'])) {
    throw new RuntimeException('Idempotent replay did not return the same capabilities.');
}
$conflict = false;
try {
    $service->create(['wheel' => $wheel, 'ttlDays' => 7], '9e553a11-255d-4a4d-bc9b-7f67d360d8fb', 'test-network', $now + 2);
} catch (ApiException $error) {
    $conflict = $error->status === 409;
}
if (!$conflict) throw new RuntimeException('Idempotency key payload conflict was not rejected.');
$read = $service->read($created['shareId'], 'test-network', $now + 2);
if ($read['wheel']['title'] !== $wheel['title'] || count($read['wheel']['entries']) !== 3) throw new RuntimeException('Encrypted snapshot round-trip failed.');
$service->revoke($created['shareId'], $created['manageToken'], 'test-network', $now + 3);
$unavailable = false;
try {
    $service->read($created['shareId'], 'test-network', $now + 4);
} catch (ApiException $error) {
    $unavailable = $error->status === 410;
}
if (!$unavailable) throw new RuntimeException('Revoked snapshots remained readable.');
$row = $pdo->query('SELECT payload_cipher, nonce, revoked_at FROM shares LIMIT 1')->fetch();
$journalCount = (int) $pdo->query('SELECT COUNT(*) FROM deletion_journal')->fetchColumn();
if ($row['payload_cipher'] !== null || $row['nonce'] !== null || $row['revoked_at'] === null || $journalCount !== 1) {
    throw new RuntimeException('Revocation did not purge payload and record restore suppression.');
}
$rateLimited = false;
for ($attempt = 0; $attempt < 11; $attempt++) {
    try {
        $idempotencyKey = sprintf('%08x-1111-4111-8111-%012x', $attempt + 1, $attempt + 1);
        $service->create($body, $idempotencyKey, 'limited-network', $now + 5);
    } catch (ApiException $error) {
        if ($error->status !== 429) throw $error;
        $rateLimited = true;
    }
}
if (!$rateLimited) throw new RuntimeException('Create request rate limit was not enforced.');
if ((int) $pdo->query("SELECT SUM(count) FROM rate_buckets WHERE window_start = " . intdiv($now + 5, 60) * 60)->fetchColumn() < 11) {
    throw new RuntimeException('Rejected requests did not retain their rate-limit increments.');
}
$expiring = $service->create(['wheel' => $wheel, 'ttlDays' => 1], 'c7f54375-6d33-4f41-a70d-9611c1b1b9c5', 'expiry-network', $now + 20);
$expired = false;
try {
    $service->read($expiring['shareId'], 'expiry-network', $now + 86420);
} catch (ApiException $error) {
    $expired = $error->status === 410;
}
$expiredPayload = $pdo->prepare('SELECT payload_cipher, unavailable_reason FROM shares WHERE id=:id');
$expiredPayload->execute(['id' => $expiring['shareId']]);
$expiredRecord = $expiredPayload->fetch();
if (!$expired || $expiredRecord['payload_cipher'] !== null || $expiredRecord['unavailable_reason'] !== 'expired') {
    throw new RuntimeException('Expired share remained readable or retained its payload.');
}
fwrite(STDOUT, "PASS: MySQL-compatible lifecycle create/replay/conflict/encrypt/read/revoke/deletion-journal checks.\n");
