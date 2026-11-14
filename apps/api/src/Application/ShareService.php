<?php

declare(strict_types=1);

namespace Lavbe\Api\Application;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Lavbe\Api\Domain\WheelRequestValidator;
use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;
use Lavbe\Api\Infrastructure\Limits;

final class ShareService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Config $config,
        private readonly Crypto $crypto,
        private readonly WheelRequestValidator $validator,
        private readonly ?int $tombstoneDays = null,
    ) {}

    public function create(array $request, string $idempotencyKey, string $networkKey, int $now): array
    {
        $validated = $this->validator->validateCreate($request);
        $canonical = json_encode($validated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $requestHash = hash('sha256', $canonical, true);
        $keyHash = $this->crypto->digest($idempotencyKey, 'idempotency');
        $network = $this->crypto->digest($networkKey, 'rate');
        $sharingLimits = Limits::sharing();
        $this->consume($network, 'create-minute', $sharingLimits['createsPerMinute'], 60, $now);
        $this->consume($network, 'create-day', $sharingLimits['createsPerDay'], 86400, $now);
        $this->pdo->beginTransaction();
        try {
            $lookup = $this->pdo->prepare('SELECT request_hash, response_cipher, nonce, key_id FROM idempotency WHERE key_hash = :key AND expires_at > FROM_UNIXTIME(:now) FOR UPDATE');
            $lookup->execute(['key' => $keyHash, 'now' => $now]);
            $existing = $lookup->fetch();
            if ($existing !== false) {
                if (!hash_equals($existing['request_hash'], $requestHash)) {
                    throw new ApiException(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used.');
                }
                $response = json_decode($this->crypto->decrypt($existing['response_cipher'], $existing['nonce'], $existing['key_id'], 'idempotency:' . bin2hex($keyHash)), true, flags: JSON_THROW_ON_ERROR);
                $this->pdo->commit();
                return $response;
            }

            $shareId = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
            $manageToken = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $created = (new DateTimeImmutable('@' . $now))->setTimezone(new DateTimeZone('UTC'));
            $expires = $created->modify('+' . $validated['ttlDays'] . ' days');
            $payload = json_encode($validated['wheel'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $encrypted = $this->crypto->encrypt($payload, 'share:' . $shareId);
            $insert = $this->pdo->prepare("INSERT INTO shares(id,payload_cipher,nonce,key_id,schema_version,created_at,expires_at,revoke_hash,unavailable_reason) VALUES (:id,:payload,:nonce,:keyId,1,:created,:expires,:revokeHash,NULL)");
            $insert->execute([
                'id' => $shareId, 'payload' => $encrypted['cipher'], 'nonce' => $encrypted['nonce'], 'keyId' => $encrypted['keyId'],
                'created' => $created->format('Y-m-d H:i:s.u'), 'expires' => $expires->format('Y-m-d H:i:s.u'), 'revokeHash' => hash('sha256', $manageToken, true),
            ]);
            $response = ['shareId' => $shareId, 'viewUrl' => $this->config->publicOrigin . '/s/' . $shareId . '/', 'manageToken' => $manageToken,
                'createdAt' => $created->format('Y-m-d\TH:i:s\Z'), 'expiresAt' => $expires->format('Y-m-d\TH:i:s\Z')];
            $encryptedResponse = $this->crypto->encrypt(json_encode($response, JSON_THROW_ON_ERROR), 'idempotency:' . bin2hex($keyHash));
            $store = $this->pdo->prepare('INSERT INTO idempotency(key_hash,request_hash,response_cipher,nonce,key_id,created_at,expires_at) VALUES (:key,:requestHash,:response,:nonce,:keyId,FROM_UNIXTIME(:now),FROM_UNIXTIME(:expires))');
            $store->execute(['key' => $keyHash, 'requestHash' => $requestHash, 'response' => $encryptedResponse['cipher'], 'nonce' => $encryptedResponse['nonce'], 'keyId' => $encryptedResponse['keyId'], 'now' => $now, 'expires' => $now + Limits::sharing()['idempotencyHours'] * 3600]);
            $this->pdo->commit();
            return $response;
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    public function read(string $shareId, string $networkKey, int $now): array
    {
        $network = $this->crypto->digest($networkKey, 'rate');
        $this->consume($network, 'read-minute', Limits::sharing()['readsPerMinute'], 60, $now);
        $query = $this->pdo->prepare('SELECT payload_cipher, nonce, key_id, schema_version, created_at, expires_at, revoked_at, unavailable_reason FROM shares WHERE id = :id');
        $query->execute(['id' => $shareId]);
        $row = $query->fetch();
        if ($row === false) {
            throw new ApiException(404, 'NOT_FOUND', 'This share could not be found.');
        }
        if ($row['revoked_at'] !== null || strtotime($row['expires_at'] . ' UTC') <= $now || $row['payload_cipher'] === null) {
            if ($row['payload_cipher'] !== null && strtotime($row['expires_at'] . ' UTC') <= $now) {
                $this->purgePayload($shareId, $now);
            }
            throw new ApiException(410, 'UNAVAILABLE', 'This share is no longer available.');
        }
        if ((int) $row['schema_version'] !== 1) {
            throw new ApiException(503, 'SERVICE_UNAVAILABLE', 'This share is temporarily unavailable.', 30);
        }
        $wheel = json_decode($this->crypto->decrypt($row['payload_cipher'], $row['nonce'], $row['key_id'], 'share:' . $shareId), true, flags: JSON_THROW_ON_ERROR);
        return ['shareId' => $shareId, 'wheel' => $wheel,
            'createdAt' => (new DateTimeImmutable($row['created_at'], new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z'),
            'expiresAt' => (new DateTimeImmutable($row['expires_at'], new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z')];
    }

    public function revoke(string $shareId, string $manageToken, string $networkKey, int $now): void
    {
        $network = $this->crypto->digest($networkKey, 'rate');
        $this->consume($network, 'revoke-minute', Limits::sharing()['revokesPerMinute'], 60, $now);
        $this->pdo->beginTransaction();
        try {
            $query = $this->pdo->prepare('SELECT revoke_hash, expires_at, revoked_at FROM shares WHERE id = :id FOR UPDATE');
            $query->execute(['id' => $shareId]);
            $row = $query->fetch();
            if ($row === false || !hash_equals($row['revoke_hash'], hash('sha256', $manageToken, true))) {
                throw new ApiException($row === false ? 404 : 401, $row === false ? 'NOT_FOUND' : 'INVALID_CAPABILITY', 'The share capability is invalid.');
            }
            if ($row['revoked_at'] === null) {
                $update = $this->pdo->prepare("UPDATE shares SET revoked_at = FROM_UNIXTIME(:now), unavailable_reason = 'revoked', payload_cipher = NULL, nonce = NULL WHERE id = :id");
                $update->execute(['now' => $now, 'id' => $shareId]);
                $journal = $this->pdo->prepare('INSERT INTO deletion_journal(share_id_hash,deleted_at,retain_until) VALUES (:hash,FROM_UNIXTIME(:now),FROM_UNIXTIME(:retain)) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at),retain_until=VALUES(retain_until)');
                $journal->execute(['hash' => hash('sha256', $shareId, true), 'now' => $now, 'retain' => $now + ($this->tombstoneDays ?? Limits::retention()['backupDays']) * 86400]);
            }
            $this->pdo->commit();
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function purgePayload(string $shareId, int $now): void
    {
        $this->pdo->beginTransaction();
        try {
            $update = $this->pdo->prepare("UPDATE shares SET payload_cipher = NULL, nonce = NULL, unavailable_reason = 'expired' WHERE id = :id AND expires_at <= FROM_UNIXTIME(:now) AND payload_cipher IS NOT NULL");
            $update->execute(['id' => $shareId, 'now' => $now]);
            if ($update->rowCount() > 0) {
                $journal = $this->pdo->prepare('INSERT INTO deletion_journal(share_id_hash,deleted_at,retain_until) VALUES (:hash,FROM_UNIXTIME(:now),FROM_UNIXTIME(:retain)) ON DUPLICATE KEY UPDATE deleted_at=VALUES(deleted_at),retain_until=VALUES(retain_until)');
                $journal->execute(['hash' => hash('sha256', $shareId, true), 'now' => $now, 'retain' => $now + ($this->tombstoneDays ?? Limits::retention()['backupDays']) * 86400]);
            }
            $this->pdo->commit();
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function consume(string $key, string $action, int $limit, int $window, int $now): void
    {
        $bucket = $this->crypto->digest($action . "\0" . $key . "\0" . intdiv($now, $window), 'rate');
        $start = intdiv($now, $window) * $window;
        $insert = $this->pdo->prepare('INSERT INTO rate_buckets(key_hash,window_start,count,expires_at) VALUES (:key,:window,1,FROM_UNIXTIME(:expires)) ON DUPLICATE KEY UPDATE count=count+1');
        $insert->execute(['key' => $bucket, 'window' => $start, 'expires' => $start + 2 * $window]);
        $count = $this->pdo->prepare('SELECT count FROM rate_buckets WHERE key_hash=:key AND window_start=:window');
        $count->execute(['key' => $bucket, 'window' => $start]);
        if ((int) $count->fetchColumn() > $limit) {
            throw new ApiException(429, 'RATE_LIMITED', 'Too many requests.', max(1, $start + $window - $now));
        }
    }
}
