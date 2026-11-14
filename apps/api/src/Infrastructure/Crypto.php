<?php

declare(strict_types=1);

namespace Lavbe\Api\Infrastructure;

final class Crypto
{
    public function __construct(private readonly Config $config) {}

    /** @return array{cipher:string,nonce:string,keyId:string} */
    public function encrypt(string $plaintext, string $context): array
    {
        $nonce = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
        $cipher = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($plaintext, $context, $nonce, $this->config->encryptionKey);
        return ['cipher' => $cipher, 'nonce' => $nonce, 'keyId' => $this->config->encryptionKeyId];
    }

    public function decrypt(string $cipher, string $nonce, string $keyId, string $context): string
    {
        $key = $this->config->encryptionKeys[$keyId] ?? ($keyId === $this->config->encryptionKeyId ? $this->config->encryptionKey : null);
        if ($key === null) {
            throw new \RuntimeException('Encryption key is unavailable.');
        }
        $plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt($cipher, $context, $nonce, $key);
        if ($plaintext === false) {
            throw new \RuntimeException('Encrypted record authentication failed.');
        }
        return $plaintext;
    }

    public function digest(string $value, string $purpose = 'rate'): string
    {
        if (!in_array($purpose, ['rate', 'idempotency'], true)) {
            throw new \InvalidArgumentException('Digest purpose is invalid.');
        }
        $key = hash_hkdf('sha256', $this->config->rateKey, 32, 'lavbe-' . $purpose . '-v1');
        return hash_hmac('sha256', $value, $key, true);
    }
}
