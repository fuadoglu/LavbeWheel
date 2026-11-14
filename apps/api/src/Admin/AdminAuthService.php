<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Lavbe\Api\Http\ApiException;
use Lavbe\Api\Infrastructure\Config;
use Lavbe\Api\Infrastructure\Crypto;

final class AdminAuthService
{
    public function __construct(private readonly PDO $pdo, private readonly Config $config, private readonly Crypto $crypto) {}

    /** @return array{userId:string,role:string,sessionToken:string,csrfToken:string,expiresAt:string} */
    public function bootstrapOwner(string $username, string $password): array
    {
        $username = strtolower(trim($username));
        if (!preg_match('/^[a-z0-9][a-z0-9._-]{2,79}$/', $username) || strlen($password) < 14 || strlen($password) > 1024) {
            throw new \InvalidArgumentException('Bootstrap username or password does not meet the required format.');
        }
        $this->pdo->beginTransaction();
        try {
            if ((int) $this->pdo->query('SELECT COUNT(*) FROM admin_users')->fetchColumn() !== 0) {
                throw new \RuntimeException('An administrator already exists.');
            }
            $id = self::token(24);
            $secret = Totp::generateSecret();
            $mfa = $this->crypto->encrypt($secret, 'admin-mfa:' . $id);
            $recovery = array_map(static fn (): string => strtoupper(bin2hex(random_bytes(6))), range(1, 10));
            $hashes = array_map(static fn (string $code): string => password_hash($code, PASSWORD_DEFAULT), $recovery);
            $now = gmdate('Y-m-d H:i:s.u');
            $insert = $this->pdo->prepare('INSERT INTO admin_users(id,username,password_hash,mfa_cipher,mfa_nonce,mfa_key_id,recovery_hashes,role,created_at,updated_at) VALUES (:id,:username,:password,:cipher,:nonce,:keyId,:recovery,\'owner\',:createdAt,:updatedAt)');
            $insert->execute(['id' => $id, 'username' => $username, 'password' => password_hash($password, PASSWORD_DEFAULT),
                'cipher' => $mfa['cipher'], 'nonce' => $mfa['nonce'], 'keyId' => $mfa['keyId'],
                'recovery' => json_encode($hashes, JSON_THROW_ON_ERROR), 'createdAt' => $now, 'updatedAt' => $now]);
            $audit = $this->pdo->prepare('INSERT INTO audit_events(id,actor_id,action_code,object_id,created_at) VALUES (:id,:actor,\'admin.bootstrap\',:objectId,:created)');
            $audit->execute(['id' => self::token(24), 'actor' => $id, 'objectId' => $id, 'created' => $now]);
            $this->pdo->commit();
            return ['userId' => $id, 'mfaSecret' => $secret, 'recoveryCodes' => $recovery, 'role' => 'owner'];
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function login(string $username, string $password, string $mfaCode, string $networkKey, int $now): array
    {
        $this->consumeLogin($networkKey, $now);
        $statement = $this->pdo->prepare('SELECT id,username,password_hash,mfa_cipher,mfa_nonce,mfa_key_id,recovery_hashes,role,disabled_at FROM admin_users WHERE username=:username');
        $statement->execute(['username' => strtolower(trim($username))]);
        $user = $statement->fetch();
        $dummyHash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        $passwordValid = password_verify($password, $user === false ? $dummyHash : $user['password_hash']);
        $mfaValid = false;
        $recoveryIndex = null;
        if ($user !== false && $user['disabled_at'] === null) {
            if (preg_match('/^[0-9]{6}$/', $mfaCode)) {
                $secret = $this->crypto->decrypt($user['mfa_cipher'], $user['mfa_nonce'], $user['mfa_key_id'], 'admin-mfa:' . $user['id']);
                $mfaValid = Totp::verify($secret, $mfaCode, $now);
            } elseif (preg_match('/^[A-F0-9]{12}$/', $mfaCode)) {
                $recoveryHashes = json_decode($user['recovery_hashes'], true, flags: JSON_THROW_ON_ERROR);
                foreach ($recoveryHashes as $index => $hash) {
                    if (is_string($hash) && password_verify($mfaCode, $hash)) {
                        $mfaValid = true;
                        $recoveryIndex = $index;
                        break;
                    }
                }
            }
        }
        if ($user === false || $user['disabled_at'] !== null || !$passwordValid || !$mfaValid) {
            throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'The credentials could not be verified.');
        }
        $session = self::token(32);
        $csrf = self::token(32);
        $sessionHash = hash('sha256', $session, true);
        $csrfCipher = $this->crypto->encrypt($csrf, 'admin-csrf:' . bin2hex($sessionHash));
        $absolute = $now + 12 * 3600;
        $idle = min($now + 1800, $absolute);
        $this->pdo->beginTransaction();
        try {
            if ($recoveryIndex !== null) {
                $lock = $this->pdo->prepare('SELECT recovery_hashes FROM admin_users WHERE id=:id AND disabled_at IS NULL FOR UPDATE');
                $lock->execute(['id' => $user['id']]);
                $current = $lock->fetchColumn();
                $recoveryHashes = is_string($current) ? json_decode($current, true, flags: JSON_THROW_ON_ERROR) : [];
                $currentIndex = null;
                foreach ($recoveryHashes as $index => $hash) {
                    if (is_string($hash) && password_verify($mfaCode, $hash)) { $currentIndex = $index; break; }
                }
                if ($currentIndex === null) throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'The credentials could not be verified.');
                $recoveryHashes[$currentIndex] = null;
                $consume = $this->pdo->prepare('UPDATE admin_users SET recovery_hashes=:updated WHERE id=:id');
                $consume->execute(['updated' => json_encode($recoveryHashes, JSON_THROW_ON_ERROR), 'id' => $user['id']]);
                if ($consume->rowCount() !== 1) throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'The credentials could not be verified.');
            }
        $insert = $this->pdo->prepare('INSERT INTO admin_sessions(session_hash,user_id,csrf_cipher,csrf_nonce,csrf_key_id,issued_at,last_seen_at,idle_expires_at,absolute_expires_at) VALUES (:hash,:user,:cipher,:nonce,:keyId,FROM_UNIXTIME(:issued),FROM_UNIXTIME(:lastSeen),FROM_UNIXTIME(:idle),FROM_UNIXTIME(:absolute))');
        $insert->execute(['hash' => $sessionHash, 'user' => $user['id'], 'cipher' => $csrfCipher['cipher'], 'nonce' => $csrfCipher['nonce'], 'keyId' => $csrfCipher['keyId'], 'issued' => $now, 'lastSeen' => $now, 'idle' => $idle, 'absolute' => $absolute]);
            $this->pdo->commit();
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
        return ['userId' => $user['id'], 'role' => $user['role'], 'sessionToken' => $session, 'csrfToken' => $csrf, 'expiresAt' => self::utc($absolute)];
    }

    public function session(string $sessionToken, int $now): array
    {
        $hash = hash('sha256', $sessionToken, true);
        $this->pdo->beginTransaction();
        try {
            $query = $this->pdo->prepare('SELECT s.user_id,s.csrf_cipher,s.csrf_nonce,s.csrf_key_id,s.idle_expires_at,s.absolute_expires_at,u.role,u.disabled_at FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.session_hash=:hash FOR UPDATE');
            $query->execute(['hash' => $hash]);
            $row = $query->fetch();
            if ($row === false || $row['disabled_at'] !== null || strtotime($row['idle_expires_at'] . ' UTC') <= $now || strtotime($row['absolute_expires_at'] . ' UTC') <= $now) {
                $delete = $this->pdo->prepare('DELETE FROM admin_sessions WHERE session_hash=:hash');
                $delete->execute(['hash' => $hash]);
                $this->pdo->commit();
                throw new ApiException(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
            }
            $expires = min($now + 1800, strtotime($row['absolute_expires_at'] . ' UTC'));
            $update = $this->pdo->prepare('UPDATE admin_sessions SET last_seen_at=FROM_UNIXTIME(:now),idle_expires_at=FROM_UNIXTIME(:expires) WHERE session_hash=:hash');
            $update->execute(['now' => $now, 'expires' => $expires, 'hash' => $hash]);
            $csrf = $this->crypto->decrypt($row['csrf_cipher'], $row['csrf_nonce'], $row['csrf_key_id'], 'admin-csrf:' . bin2hex($hash));
            $this->pdo->commit();
            return ['userId' => $row['user_id'], 'role' => $row['role'], 'csrfToken' => $csrf, 'expiresAt' => self::utc($row['absolute_expires_at'])];
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function logout(string $sessionToken): void
    {
        $statement = $this->pdo->prepare('DELETE FROM admin_sessions WHERE session_hash=:hash');
        $statement->execute(['hash' => hash('sha256', $sessionToken, true)]);
    }

    public function assertCsrf(array $session, ?string $token): void
    {
        if ($token === null || !hash_equals($session['csrfToken'], $token)) {
            throw new ApiException(403, 'ACCESS_DENIED', 'The request could not be authorized.');
        }
    }

    public function consumeLogin(string $networkKey, int $now): void
    {
        $start = intdiv($now, 900) * 900;
        $key = $this->crypto->digest('admin-login:' . $networkKey . ':' . $start, 'rate');
        $insert = $this->pdo->prepare('INSERT INTO rate_buckets(key_hash,window_start,count,expires_at) VALUES (:key,:window,1,FROM_UNIXTIME(:expires)) ON DUPLICATE KEY UPDATE count=count+1');
        $insert->execute(['key' => $key, 'window' => $start, 'expires' => $start + 1800]);
        $query = $this->pdo->prepare('SELECT count FROM rate_buckets WHERE key_hash=:key AND window_start=:window');
        $query->execute(['key' => $key, 'window' => $start]);
        if ((int) $query->fetchColumn() > 5) throw new ApiException(429, 'RATE_LIMITED', 'Too many sign-in attempts.', max(1, $start + 900 - $now));
    }

    private static function token(int $bytes): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    private static function utc(int|string $time): string
    {
        $date = is_int($time) ? new DateTimeImmutable('@' . $time) : new DateTimeImmutable($time, new DateTimeZone('UTC'));
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }
}
