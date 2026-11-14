<?php

declare(strict_types=1);

namespace Lavbe\Api\Infrastructure;

final class Limits
{
    private static ?array $config = null;

    public static function all(): array
    {
        if (self::$config === null) {
            $path = dirname(__DIR__, 4) . '/config/limits.json';
            $json = file_get_contents($path);
            if ($json === false) throw new \RuntimeException('API limits configuration is unavailable.');
            $config = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
            if (!is_array($config) || ($config['schemaVersion'] ?? null) !== 1 || !isset($config['sharing'], $config['retention'])) {
                throw new \RuntimeException('API limits configuration is invalid.');
            }
            self::$config = $config;
        }
        return self::$config;
    }

    public static function sharing(): array
    {
        return self::all()['sharing'];
    }

    public static function retention(): array
    {
        return self::all()['retention'];
    }

    public static function content(): array
    {
        return self::all()['content'];
    }
}
