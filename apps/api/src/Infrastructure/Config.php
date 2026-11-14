<?php

declare(strict_types=1);

namespace Lavbe\Api\Infrastructure;

final class Config
{
    public function __construct(
        public readonly string $appOrigin,
        public readonly string $publicOrigin,
        public readonly string $databaseDsn,
        public readonly string $databaseUser,
        public readonly string $databasePassword,
        public readonly string $encryptionKeyId,
        public readonly string $encryptionKey,
        public readonly string $rateKey,
        public readonly array $trustedProxies = [],
        public readonly array $encryptionKeys = [],
        public readonly ?string $manifestSigningSecretKey = null,
    ) {}

    public static function fromEnvironment(): self
    {
        $key = self::env('LAVBE_ENCRYPTION_KEY');
        $rateKey = self::env('LAVBE_RATE_KEY');
        $origin = self::env('LAVBE_APP_ORIGIN');
        $publicOrigin = self::env('LAVBE_PUBLIC_ORIGIN');
        $dsn = self::env('LAVBE_DATABASE_DSN');
        $user = self::env('LAVBE_DATABASE_USER');
        $password = self::env('LAVBE_DATABASE_PASSWORD');
        $keyId = self::env('LAVBE_ENCRYPTION_KEY_ID');
        $manifestSigningEncoded = self::env('LAVBE_MANIFEST_SIGNING_SECRET_KEY');
        $manifestSigningKey = base64_decode($manifestSigningEncoded, true);
        foreach ([$key, $rateKey] as $secret) {
            if (strlen($secret) !== SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES) {
                throw new \RuntimeException('API secret configuration is invalid.');
            }
        }
        if (!self::isOrigin($origin) || !self::isOrigin($publicOrigin) || !str_starts_with($dsn, 'mysql:')) {
            throw new \RuntimeException('API origin or MySQL configuration is invalid.');
        }
        $originParts = parse_url($origin);
        $publicParts = parse_url($publicOrigin);
        $localHosts = ['localhost', '127.0.0.1', '[::1]', '::1'];
        $insecureLocalAllowed = getenv('LAVBE_ALLOW_INSECURE_LOCAL') === '1'
            && in_array(strtolower($originParts['host'] ?? ''), $localHosts, true)
            && in_array(strtolower($publicParts['host'] ?? ''), $localHosts, true);
        if ((!str_starts_with($origin, 'https://') || !str_starts_with($publicOrigin, 'https://'))
            && !$insecureLocalAllowed) {
            throw new \RuntimeException('HTTPS is required for API origins.');
        }
        if (!preg_match('/^[A-Za-z0-9_-]{1,32}$/', $keyId)) {
            throw new \RuntimeException('API encryption key ID is invalid.');
        }
        if ($manifestSigningKey === false || strlen($manifestSigningKey) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) {
            throw new \RuntimeException('Manifest signing key configuration is invalid.');
        }
        $proxies = array_values(array_filter(array_map('trim', explode(',', getenv('LAVBE_TRUSTED_PROXIES') ?: ''))));
        $keyRing = [$keyId => $key];
        $keyRingRaw = getenv('LAVBE_ENCRYPTION_KEYS');
        if ($keyRingRaw !== false && $keyRingRaw !== '') {
            try {
                $encoded = json_decode($keyRingRaw, true, flags: JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                throw new \RuntimeException('API encryption key ring is invalid.');
            }
            if (!is_array($encoded) || array_is_list($encoded) || !isset($encoded[$keyId])) {
                throw new \RuntimeException('API encryption key ring is invalid.');
            }
            $keyRing = [];
            foreach ($encoded as $id => $base64) {
                if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,32}$/', $id) || !is_string($base64)) {
                    throw new \RuntimeException('API encryption key ring is invalid.');
                }
                $decoded = base64_decode($base64, true);
                if ($decoded === false || strlen($decoded) !== SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_KEYBYTES) {
                    throw new \RuntimeException('API encryption key ring is invalid.');
                }
                $keyRing[$id] = $decoded;
            }
        }
        return new self($origin, $publicOrigin, $dsn, $user, $password, $keyId, $key, $rateKey, $proxies, $keyRing, $manifestSigningKey);
    }

    private static function env(string $name): string
    {
        $value = getenv($name);
        if ($value === false || $value === '') {
            throw new \RuntimeException('API server configuration is incomplete.');
        }
        return $value;
    }

    private static function isOrigin(string $origin): bool
    {
        $parts = parse_url($origin);
        return $parts !== false && isset($parts['scheme'], $parts['host'])
            && in_array($parts['scheme'], ['https', 'http'], true)
            && !isset($parts['user'], $parts['pass'], $parts['path'], $parts['query'], $parts['fragment']);
    }
}
