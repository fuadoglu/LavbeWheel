<?php

declare(strict_types=1);

namespace Lavbe\Api\Http;

use Lavbe\Api\Infrastructure\Limits;

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $headers,
        public readonly string $body,
        public readonly string $remoteAddress,
        public readonly string $scheme,
        public readonly int $contentLength,
        public readonly array $query = [],
    ) {}

    public static function fromGlobals(): self
    {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$name] ??= $value;
            }
        }
        $maxBodyBytes = Limits::sharing()['maxBodyBytes'];
        $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        if (str_starts_with($requestPath, '/api/admin/v1/imports')) {
            $maxBodyBytes = Limits::content()['maxImportBytes'];
        } elseif (str_starts_with($requestPath, '/api/admin/v1/')) {
            $maxBodyBytes = 8192;
        }
        $body = file_get_contents('php://input', false, null, 0, $maxBodyBytes + 1);
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/',
            array_change_key_case($headers, CASE_LOWER), $body === false ? '' : $body,
            $_SERVER['REMOTE_ADDR'] ?? '', (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http',
            (int) ($_SERVER['CONTENT_LENGTH'] ?? strlen($body ?: '')), $_GET);
    }

    public function header(string $name): ?string
    {
        $value = $this->headers[strtolower($name)] ?? null;
        return is_string($value) ? trim($value) : null;
    }
}
