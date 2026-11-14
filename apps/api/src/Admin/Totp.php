<?php

declare(strict_types=1);

namespace Lavbe\Api\Admin;

final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    public static function verify(string $secret, string $code, int $timestamp, int $window = 1): bool
    {
        if (!preg_match('/^[0-9]{6}$/', $code)) return false;
        $key = self::base32Decode($secret);
        if ($key === false) return false;
        $counter = intdiv($timestamp, 30);
        for ($offset = -$window; $offset <= $window; $offset++) {
            $packed = pack('N2', intdiv($counter + $offset, 0x100000000), ($counter + $offset) & 0xffffffff);
            $hash = hash_hmac('sha1', $packed, $key, true);
            $index = ord($hash[19]) & 0x0f;
            $value = ((ord($hash[$index]) & 0x7f) << 24) | ((ord($hash[$index + 1]) & 0xff) << 16)
                | ((ord($hash[$index + 2]) & 0xff) << 8) | (ord($hash[$index + 3]) & 0xff);
            $candidate = str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
            if (hash_equals($candidate, $code)) return true;
        }
        return false;
    }

    public static function base32Encode(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $byte) $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        $encoded = '';
        foreach (str_split($bits, 5) as $chunk) {
            if (strlen($chunk) < 5) $chunk = str_pad($chunk, 5, '0');
            $encoded .= self::ALPHABET[bindec($chunk)];
        }
        return $encoded;
    }

    private static function base32Decode(string $text): string|false
    {
        $text = strtoupper(rtrim($text, '='));
        if ($text === '' || preg_match('/[^A-Z2-7]/', $text)) return false;
        $bits = '';
        foreach (str_split($text) as $char) $bits .= str_pad(decbin(strpos(self::ALPHABET, $char)), 5, '0', STR_PAD_LEFT);
        $bytes = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) $bytes .= chr(bindec($chunk));
        }
        return $bytes;
    }
}
